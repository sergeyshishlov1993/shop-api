import { decodeText, parseCsv, parseNumber } from './csv.util';

describe('parseCsv', () => {
  it('splits rows and fields by comma', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('detects ";" separator (1С/Excel uk) and keeps decimal comma inside a field', () => {
    expect(parseCsv('\uFEFFАртикул;Ціна\nA-1;1 234,50\n')).toEqual([['Артикул', 'Ціна'], ['A-1', '1 234,50']]);
  });
  it('detects tab separator', () => {
    expect(parseCsv('a\tb\n1,5\t2\n')).toEqual([['a', 'b'], ['1,5', '2']]);
  });
  it('ignores separators inside quoted header when detecting', () => {
    expect(parseCsv('"a;b",c\n1,2')).toEqual([['a;b', 'c'], ['1', '2']]);
  });
  it('handles quoted commas, escaped quotes and CRLF', () => {
    expect(parseCsv('"x, y","say ""hi"""\r\n1,2')).toEqual([['x, y', 'say "hi"'], ['1', '2']]);
  });
  it('keeps newlines inside quotes', () => {
    expect(parseCsv('a,"line1\nline2"\n')).toEqual([['a', 'line1\nline2']]);
  });
  it('drops empty and whitespace-only lines', () => {
    expect(parseCsv('a,b\n\n , \n1,2\n\n')).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('keeps trailing empty field', () => {
    expect(parseCsv('a,')).toEqual([['a', '']]);
  });
});

describe('decodeText', () => {
  it('reads UTF-8 and falls back to windows-1251', () => {
    expect(decodeText(Buffer.from('Сукня', 'utf-8'))).toBe('Сукня');
    expect(decodeText(Buffer.from([0xd1, 0xf3, 0xea, 0xed, 0xff]))).toBe('Сукня');
  });
});

describe('parseNumber', () => {
  it.each([
    ['1 234,50', 1234.5], ['1\u00a0234,50 грн.', 1234.5], ['1,234.50', 1234.5], ['1.234,50', 1234.5],
    ['10,5', 10.5], ['99', 99], ['12.5', 12.5], [12, 12], ['', undefined], ['abc', undefined], [undefined, undefined],
  ])('%p -> %p', (input, expected) => {
    expect(parseNumber(input)).toBe(expected);
  });
});
