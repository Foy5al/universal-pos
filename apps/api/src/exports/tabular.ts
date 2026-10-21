import type { ReportExportKind } from '@pos/contracts';

export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
}

export type ExportCell = string | number | null;
export type ExportRow = Record<string, ExportCell>;

export interface ReportDocument {
  kind: ReportExportKind;
  title: string;
  filenameStem: string;
  /** Context lines (tenant, range, author) written above the table. */
  meta: readonly string[];
  columns: readonly ExportColumn[];
  rows: readonly ExportRow[];
  totals?: ExportRow;
}

// Excel/LibreOffice evaluate cells starting with these characters as formulas.
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Escapes a cell so spreadsheet apps treat it as data. Text that looks like a
 * formula gets a leading apostrophe; numbers stay numeric.
 */
export function sanitizeCell(value: ExportCell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const text = String(value);
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

function quoteCell(value: ExportCell): string {
  const text = sanitizeCell(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toLine(cells: readonly ExportCell[]): string {
  return cells.map(quoteCell).join(',');
}

/** RFC 4180 CSV with a `#` metadata preamble and an optional totals row. */
export function toCsv(document: ReportDocument): string {
  const lines: string[] = document.meta.map((line) => `# ${sanitizeCell(line)}`);
  lines.push('', toLine(document.columns.map((column) => column.header)));
  for (const row of document.rows) {
    lines.push(toLine(document.columns.map((column) => row[column.key] ?? null)));
  }
  if (document.totals) {
    lines.push('', toLine(document.columns.map((column) => document.totals?.[column.key] ?? null)));
  }
  return `${lines.join('\r\n')}\r\n`;
}
