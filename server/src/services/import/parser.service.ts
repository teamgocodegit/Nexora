import * as XLSX from 'xlsx';
import { parse as csvParse } from 'csv-parse/sync';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface SheetInfo {
  name: string;
  rowCount: number;
}

export interface ParsedFile {
  sheets: SheetInfo[];
  selectedSheet: string;
  headers: string[];
  rows: string[][];
  rawRows: unknown[][];
  delimiter?: string;
  fileFingerprint: string;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const SUPPORTED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
];

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
}

function computeFingerprint(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

function normalizeHeaders(headers: string[]): string[] {
  return headers.map((h) => {
    if (h === null || h === undefined) return '';
    return String(h).trim();
  });
}

function detectDelimiter(firstLine: string): string {
  const delimiters = [',', '\t', ';', '|'];
  const counts = delimiters.map((d) => ({
    d,
    count: (firstLine.match(new RegExp(d === '\t' ? '\\t' : `\\${d}`, 'g')) || []).length,
  }));
  counts.sort((a, b) => b.count - a.count);
  return counts[0].count > 0 ? counts[0].d : ',';
}

function detectEncoding(buffer: Buffer): string {
  const isUtf16 = buffer[0] === 0xFF && buffer[1] === 0xFE;
  if (isUtf16) return 'utf16le';
  return 'utf-8';
}

export function parseFile(filePath: string, originalName: string, sheetName?: string): ParsedFile {
  const ext = path.extname(originalName).toLowerCase();
  const buffer = fs.readFileSync(filePath);

  if (buffer.length === 0) {
    throw new Error('File is empty');
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error('File size exceeds maximum allowed size of 10MB');
  }

  const fingerprint = computeFingerprint(buffer);

  if (ext === '.xlsx' || ext === '.xls') {
    return parseXLSX(buffer, fingerprint, ext, sheetName);
  } else if (ext === '.csv') {
    return parseCSV(buffer, originalName, fingerprint);
  } else {
    throw new Error(`Unsupported file format: ${ext}. Supported formats: .xlsx, .xls, .csv`);
  }
}

export function inspectFile(filePath: string, originalName: string): { sheets: SheetInfo[]; fileFingerprint: string } {
  const ext = path.extname(originalName).toLowerCase();
  const buffer = fs.readFileSync(filePath);

  if (buffer.length === 0) {
    throw new Error('File is empty');
  }

  if (buffer.length > MAX_FILE_SIZE) {
    throw new Error('File size exceeds maximum allowed size of 10MB');
  }

  const fingerprint = computeFingerprint(buffer);

  if (ext === '.xlsx' || ext === '.xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
    const sheets: SheetInfo[] = workbook.SheetNames.map((name) => {
      const sheet = workbook.Sheets[name];
      const ref = sheet['!ref'];
      const rowCount = ref ? XLSX.utils.decode_range(ref).e.r + 1 : 0;
      return { name, rowCount };
    });
    return { sheets, fileFingerprint: fingerprint };
  } else if (ext === '.csv') {
    return { sheets: [{ name: 'Sheet1', rowCount: 0 }], fileFingerprint: fingerprint };
  } else {
    throw new Error(`Unsupported file format: ${ext}`);
  }
}

function parseXLSX(buffer: Buffer, fingerprint: string, ext: string, sheetName?: string): ParsedFile {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheets: SheetInfo[] = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const ref = sheet['!ref'];
    const rowCount = ref ? XLSX.utils.decode_range(ref).e.r + 1 : 0;
    return { name, rowCount };
  });

  const targetSheet = sheetName && workbook.SheetNames.includes(sheetName)
    ? sheetName
    : workbook.SheetNames[0];

  const sheet = workbook.Sheets[targetSheet];
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', header: 'A' });

  const headerKeys = Object.keys(jsonData[0] || {});
  const headers = normalizeHeaders(
    headerKeys.map((k) => jsonData[0][k] as string).filter(Boolean)
  );

  let dataStartIndex = 1;
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    const values = headerKeys.map((k) => row[k]);
    const hasData = values.some((v) => v !== '' && v !== null && v !== undefined);
    if (hasData || headers.length > 0) {
      dataStartIndex = i;
      break;
    }
  }

  const rows: string[][] = [];
  const rawRows: unknown[][] = [];
  for (let i = dataStartIndex; i < jsonData.length; i++) {
    const row = jsonData[i];
    const values = headerKeys.map((k) => String(row[k] ?? '').trim());
    const hasData = values.some((v) => v !== '');
    if (!hasData) continue;
    rows.push(values.slice(0, headers.length));
    rawRows.push(headerKeys.map((k) => row[k]));
  }

  return { sheets, selectedSheet: targetSheet, headers, rows, rawRows, fileFingerprint: fingerprint };
}

function parseCSV(buffer: Buffer, originalName: string, fingerprint: string): ParsedFile {
  const encoding = detectEncoding(buffer);
  const content = encoding === 'utf16le'
    ? buffer.toString('utf16le')
    : buffer.toString('utf-8');

  const firstLine = content.split('\n')[0];
  const delimiter = detectDelimiter(firstLine);

  const records: string[][] = csvParse(content, {
    delimiter,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true,
  });

  if (records.length === 0) {
    throw new Error('CSV file contains no data');
  }

  const headers = normalizeHeaders(records[0]);
  const rows = records.slice(1).filter((row) => row.some((cell) => cell.trim() !== ''));

  const cleanedRows = rows.map((row) => {
    while (row.length < headers.length) { row.push(''); }
    return row.slice(0, headers.length);
  });

  return {
    sheets: [{ name: 'Sheet1', rowCount: records.length - 1 }],
    selectedSheet: 'Sheet1',
    headers,
    rows: cleanedRows,
    rawRows: cleanedRows,
    delimiter,
    fileFingerprint: fingerprint,
  };
}

export function cleanupFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Silent cleanup
  }
}
