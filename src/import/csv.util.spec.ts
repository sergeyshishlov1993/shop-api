import { parseCsv } from './csv.util';

describe('parseCsv', () => {
  it('splits rows and fields (comma and semicolon)', () => {
    expect(parseCsv('a,b\n1;2\n')).toEqual([['a', 'b'], ['1', '2']]);
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
