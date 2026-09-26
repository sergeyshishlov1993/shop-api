import { slugify, uniqueSlug } from './slug.util';

describe('slugify', () => {
  it('transliterates Ukrainian/Russian', () => {
    expect(slugify('Жіноча Сукня')).toBe('zhinocha-suknia');
    expect(slugify('Щука ї є ґ')).toBe('shchuka-i-ie-g');
    expect(slugify('Объём')).toBe('obem');
  });
  it('collapses non-alnum and trims dashes', () => {
    expect(slugify('  Hello, World!! 2024 ')).toBe('hello-world-2024');
  });
  it('falls back to "item" and limits length', () => {
    expect(slugify('!!!')).toBe('item');
    expect(slugify('a'.repeat(200))).toHaveLength(80);
  });
});

describe('uniqueSlug', () => {
  it('returns base when free', async () => {
    expect(await uniqueSlug('Сукня', async () => false)).toBe('suknia');
  });
  it('appends -2, -3 while taken', async () => {
    const taken = new Set(['suknia', 'suknia-2']);
    expect(await uniqueSlug('Сукня', async (s) => taken.has(s))).toBe('suknia-3');
  });
});
