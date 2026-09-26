import { parseYml } from './yml.util';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<yml_catalog><shop>
  <categories>
    <category id="1">Одяг</category>
    <category id="2" parentId="1">Сукні</category>
  </categories>
  <offers>
    <offer id="10" group_id="G1" available="true">
      <name>Сукня</name><vendorCode>SKU-S</vendorCode><price>1000,50</price><oldprice>1200</oldprice>
      <categoryId>2</categoryId><vendor>Brand</vendor>
      <picture>http://x/1.jpg</picture><picture>http://x/2.jpg</picture>
      <param name="Розмір">S</param><param name="Колір">Червоний</param>
      <stock_quantity>5</stock_quantity>
      <description><![CDATA[<p>Опис &amp; текст</p>]]></description>
    </offer>
    <offer id="11" group_id="G1" available="false">
      <name>Сукня</name><vendorCode>SKU-M</vendorCode><price>1000</price>
      <param name="Размер">M</param><param name="Цвет">Синий</param>
      <picture>http://x/3.jpg</picture>
    </offer>
    <offer id="12">
      <model>Футболка</model><price>300</price><quantity_in_stock>7</quantity_in_stock>
    </offer>
  </offers>
</shop></yml_catalog>`;

describe('parseYml', () => {
  const { categories, offers } = parseYml(xml);

  it('parses categories with parentId', () => {
    expect(categories).toEqual([
      { id: '1', parentId: undefined, name: 'Одяг' },
      { id: '2', parentId: '1', name: 'Сукні' },
    ]);
  });

  it('parses offer fields, params (uk), multiple pictures, CDATA', () => {
    const o = offers[0];
    expect(o).toMatchObject({
      id: '10', sku: 'SKU-S', groupId: 'G1', available: true, name: 'Сукня',
      price: 1000.5, oldPrice: 1200, vendor: 'Brand', categoryId: '2', stockQty: 5,
      pictures: ['http://x/1.jpg', 'http://x/2.jpg'], size: 'S', color: 'Червоний',
    });
    expect(o.description).toBe('<p>Опис &amp; текст</p>');
  });

  it('parses ru params, single picture, available=false without qty', () => {
    const o = offers[1];
    expect(o).toMatchObject({ sku: 'SKU-M', groupId: 'G1', available: false, size: 'M', color: 'Синий' });
    expect(o.pictures).toEqual(['http://x/3.jpg']);
    expect(o.stockQty).toBeUndefined(); // → 0 is applied in ImportService.runYml
  });

  it('falls back sku→id, name→model, qty→quantity_in_stock', () => {
    expect(offers[2]).toMatchObject({ sku: '12', name: 'Футболка', stockQty: 7, groupId: undefined, available: true, pictures: [] });
  });

  it('empty document → empty lists', () => {
    expect(parseYml('<yml_catalog/>')).toEqual({ categories: [], offers: [] });
  });
});
