// Простой потоковый CSV-парсер: поддерживает кавычки, экранированные "",
// переносы строк внутри полей. Разделитель (, ; или таб) определяется по первой строке:
// в CSV из 1С/Excel (uk/ru локаль) разделитель ';', а запятая — десятичная в цене.
export function parseCsv(text: string): string[][] {
  text = text.replace(/^﻿/, '');
  const sep = detectSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// Самый частый из , ; \t в первой строке вне кавычек; по умолчанию запятая
function detectSeparator(text: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const c of text) {
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && c === '\n') break;
    else if (!inQuotes && c in counts) counts[c]++;
  }
  const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : ',';
}

// UTF-8, а если байты невалидны — windows-1251 (типичная выгрузка 1С/Excel)
export function decodeText(buffer: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1251').decode(buffer);
  }
}

// "1 234,50" / "1,234.50" / "1234.5" / "1 234 грн" -> число; пусто или мусор -> undefined.
// Десятичный — последний из , и . ; другой считается разделителем тысяч.
export function parseNumber(value: unknown): number | undefined {
  let s = String(value ?? '').replace(/[^\d.,-]/g, '').replace(/^[.,]+|[.,]+$/g, '');
  s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  if (!/\d/.test(s)) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
