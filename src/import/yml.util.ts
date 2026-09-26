import { XMLParser } from 'fast-xml-parser';

export type YmlCategory = { id: string; parentId?: string; name: string };
export type YmlOffer = {
  id: string;
  sku: string;
  groupId?: string;
  available: boolean;
  name: string;
  description?: string;
  price?: number;
  oldPrice?: number;
  vendor?: string;
  categoryId?: string;
  stockQty?: number;
  pictures: string[];
  size?: string;
  color?: string;
};

const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const text = (v: unknown): string | undefined => {
  if (v === undefined || v === null) return undefined;
  const s = String(typeof v === 'object' ? (v as { '#text'?: unknown })['#text'] ?? '' : v).trim();
  return s || undefined;
};
const num = (v: unknown): number | undefined => {
  const s = text(v);
  if (s === undefined) return undefined;
  const n = Number(s.replace(',', '.'));
  return Number.isNaN(n) ? undefined : n;
};

// Парсер YML (Yandex Market Language) — формат выгрузок Rozetka/Prom.
export function parseYml(xml: string): { categories: YmlCategory[]; offers: YmlOffer[] } {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: false });
  const shop = parser.parse(xml)?.yml_catalog?.shop ?? {};

  const categories = arr(shop.categories?.category).map((c: any) => ({
    id: String(c['@id']),
    parentId: c['@parentId'] ? String(c['@parentId']) : undefined,
    name: text(c) ?? '',
  }));

  const offers = arr(shop.offers?.offer).map((o: any): YmlOffer => {
    const params = arr(o.param).map((p: any) => ({ name: String(p['@name'] ?? '').trim(), value: text(p) }));
    const param = (...names: string[]) => params.find((p) => names.includes(p.name))?.value;
    return {
      id: String(o['@id']),
      sku: text(o.vendorCode) ?? String(o['@id']),
      groupId: o['@group_id'] ? String(o['@group_id']) : undefined,
      available: o['@available'] !== 'false',
      name: text(o.name) ?? text(o.model) ?? '',
      description: text(o.description),
      price: num(o.price),
      oldPrice: num(o.oldprice),
      vendor: text(o.vendor),
      categoryId: text(o.categoryId),
      stockQty: num(o.stock_quantity) ?? num(o.quantity_in_stock),
      pictures: arr(o.picture).map(text).filter((u): u is string => !!u),
      size: param('Размер', 'Розмір'),
      color: param('Цвет', 'Колір'),
    };
  });

  return { categories, offers };
}
