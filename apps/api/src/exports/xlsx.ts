import ExcelJS from 'exceljs';

import { sanitizeCell, type ExportCell, type ReportDocument } from './tabular';

function cellValue(value: ExportCell): string | number {
  return typeof value === 'number' ? value : sanitizeCell(value);
}

/** Builds a single-sheet workbook with metadata, a bold header and totals. */
export async function toXlsx(document: ReportDocument): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Universal POS';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(document.kind.slice(0, 31));

  for (const line of document.meta) {
    const row = sheet.addRow([sanitizeCell(line)]);
    row.font = { italic: true, color: { argb: 'FF555555' } };
  }
  sheet.addRow([]);

  const header = sheet.addRow(document.columns.map((column) => column.header));
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F7' } };

  for (const row of document.rows) {
    sheet.addRow(document.columns.map((column) => cellValue(row[column.key] ?? null)));
  }

  if (document.totals) {
    sheet.addRow([]);
    const totals = document.totals;
    const row = sheet.addRow(
      document.columns.map((column) => cellValue(totals[column.key] ?? null)),
    );
    row.font = { bold: true };
  }

  document.columns.forEach((column, index) => {
    const target = sheet.getColumn(index + 1);
    target.width = column.width ?? (index === 0 ? 32 : 18);
  });

  sheet.views = [{ state: 'frozen', ySplit: document.meta.length + 2 }];

  return workbook.xlsx.writeBuffer();
}
