import ExcelJS from 'exceljs';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { sanitizeCell, toCsv, type ReportDocument } from '../src/exports/tabular';
import { toXlsx } from '../src/exports/xlsx';
import {
  LOCATION_A,
  LOCATION_B,
  LOCATION_C,
  ORG_B,
  PRODUCT_B,
  createSalesFixture,
  type SalesFixture,
} from './support/salesFixture';

function totalsRowOf(sheet: ExcelJS.Worksheet | undefined): ExcelJS.Row | undefined {
  let found: ExcelJS.Row | undefined;
  sheet?.eachRow((row) => {
    if (row.getCell(1).value === 'Total') found = row;
  });
  return found;
}

const documentFixture: ReportDocument = {
  kind: 'sales-summary',
  title: 'Sales summary',
  filenameStem: 'sales-summary-2026-10-01-2026-10-02',
  meta: ['Universal POS - Sales summary'],
  columns: [
    { key: 'date', header: 'Date' },
    { key: 'grossSalesMinor', header: 'Gross sales (minor)' },
  ],
  rows: [
    { date: '2026-10-01', grossSalesMinor: 1000 },
    { date: '=cmd|calc', grossSalesMinor: 500 },
  ],
  totals: { date: 'Total', grossSalesMinor: 1500 },
};

describe('report export serializers', () => {
  it('neutralizes spreadsheet formula prefixes', () => {
    expect(sanitizeCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(sanitizeCell('@import')).toBe("'@import");
    expect(sanitizeCell('-1+1')).toBe("'-1+1");
    expect(sanitizeCell(-5)).toBe('-5');
    expect(sanitizeCell(null)).toBe('');
  });

  it('writes CSV with a metadata preamble, escaped cells and totals', () => {
    const csv = toCsv(documentFixture);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('# Universal POS - Sales summary');
    expect(lines).toContain('Date,Gross sales (minor)');
    expect(lines).toContain("'=cmd|calc,500");
    expect(lines).toContain('Total,1500');
  });

  it('quotes delimiters and line breaks without changing numbers', () => {
    const csv = toCsv({
      ...documentFixture,
      rows: [{ date: 'a,"b"\nc', grossSalesMinor: 7 }],
      totals: undefined,
    });
    expect(csv).toContain('"a,""b""\nc",7');
  });

  it('writes a workbook with headers, rows and a bold totals row', async () => {
    const bytes = await toXlsx(documentFixture);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);

    const sheet = workbook.worksheets[0];
    const values = (sheet?.getSheetValues() ?? []) as unknown[][];
    const flat = values.map((row) => (row ?? []).join('|'));
    expect(flat.some((line) => line.includes('Gross sales (minor)'))).toBe(true);
    expect(flat.some((line) => line.includes("'=cmd|calc"))).toBe(true);

    const totalsRow = totalsRowOf(sheet);
    expect(totalsRow?.getCell(2).value).toBe(1500);
    expect(totalsRow?.font?.bold).toBe(true);
  });
});

describe('report export API', () => {
  let fixture: SalesFixture;

  beforeAll(async () => {
    fixture = await createSalesFixture();
    await fixture.createSale('cashier-a@example.com', fixture.saleBody()).expect(201);
    await fixture
      .createSale(
        'cashier-b@example.com',
        fixture.saleBody({
          locationId: LOCATION_B,
          registerShiftId: fixture.shifts[ORG_B],
          lines: [{ productId: PRODUCT_B, quantity: '3' }],
          payments: [{ method: 'cash', tenderedMinor: 6000 }],
        }),
      )
      .expect(201);
  });

  function csvExport(email: string, kind = 'sales-summary', query = '') {
    return request(fixture.app)
      .get(`/v1/reports/${kind}/export${query}`)
      .set('authorization', fixture.auth(email));
  }

  it('requires authentication and the reports:export permission', async () => {
    await request(fixture.app).get('/v1/reports/sales-summary/export').expect(401);
    await csvExport('viewer-a@example.com').expect(403);
  });

  it('streams a CSV attachment with totals for the requested range', async () => {
    const res = await csvExport('analyst-a@example.com').expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="sales-summary-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(res.text).toContain('Date (UTC),Sales,Refunds');
    expect(res.text).toContain('Total,1,0,2000,0,2000,2');
  });

  it('streams an xlsx workbook whose totals match the report', async () => {
    const server = fixture.app.listen(0);
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('test server has no port');
      const response = await fetch(
        `http://127.0.0.1:${address.port}/v1/reports/sales-summary/export?format=xlsx`,
        { headers: { authorization: fixture.auth('analyst-a@example.com') } },
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toContain('.xlsx"');

      const bytes = await response.arrayBuffer();
      expect(new Uint8Array(bytes, 0, 2).join()).toBe('80,75');

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(bytes);
      const totals = totalsRowOf(workbook.worksheets[0]);
      expect(totals?.getCell(4).value).toBe(2000);
      expect(totals?.getCell(7).value).toBe('2');
    } finally {
      server.close();
    }
  });

  it('exports store activity as metric rows', async () => {
    const res = await csvExport('analyst-a@example.com', 'store-activity').expect(200);
    expect(res.text).toContain('Metric,Count,Units,Value (minor)');
    expect(res.text).toContain('Net sales');
  });

  it('keeps tenants and store scopes apart', async () => {
    const other = await csvExport('analyst-b@example.com').expect(200);
    expect(other.text).toContain('Total,1,0,6000,0,6000,3');

    await csvExport('analyst-a@example.com', 'sales-summary', `?locationId=${LOCATION_A}`).expect(
      200,
    );
    await csvExport('scoped-a@example.com', 'sales-summary', `?locationId=${LOCATION_A}`).expect(
      404,
    );
    await csvExport('scoped-a@example.com', 'sales-summary', `?locationId=${LOCATION_C}`).expect(
      200,
    );
  });

  it('rejects unknown report kinds and formats', async () => {
    await csvExport('analyst-a@example.com', 'payroll').expect(422);
    await csvExport('analyst-a@example.com').query({ format: 'pdf' }).expect(422);
  });
});
