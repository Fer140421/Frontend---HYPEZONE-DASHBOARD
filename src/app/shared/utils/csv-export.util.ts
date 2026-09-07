export interface CsvColumn<T> {
  header: string;
  value: (item: T) => unknown;
}

/** Downloads tabular data as an UTF-8 CSV that opens correctly in Excel. */
export function downloadCsv<T>(filename: string, columns: readonly CsvColumn<T>[], rows: readonly T[]): void {
  const lines = [
    columns.map((column) => escapeCsvValue(column.header)).join(','),
    ...rows.map((row) => columns.map((column) => escapeCsvValue(column.value(row))).join(',')),
  ];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const date = toDate(value);
    if (date) return date.toISOString();
    return JSON.stringify(value);
  }
  return `"${String(value).replace(/"/g, '""')}"`;
}

function toDate(value: object): Date | null {
  if ('toDate' in value && typeof value.toDate === 'function') {
    const date = value.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}
