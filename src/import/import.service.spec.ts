import { BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { ImportService } from './import.service';

const csv = (s: string) => Buffer.from(s, 'utf-8');

function setup() {
  const prisma: any = {
    productVariant: { findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn(), create: jest.fn() },
    product: { update: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    category: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn() },
    size: { findFirst: jest.fn(), create: jest.fn() },
    color: { findFirst: jest.fn(), create: jest.fn() },
    productMedia: { create: jest.fn(), findFirst: jest.fn() },
  };
  const cache: any = { invalidateProduct: jest.fn() };
  const files: any = { upload: jest.fn() };
  return { prisma, cache, files, service: new ImportService(prisma, cache, files) };
}

describe('ImportService.runStock', () => {
  it('validates mapping', async () => {
    const { service } = setup();
    await expect(service.runStock(csv('a\n1'), { sku: NaN, price: 1 })).rejects.toThrow(BadRequestException);
    await expect(service.runStock(csv('a\n1'), { sku: 0 })).rejects.toThrow(BadRequestException);
  });

  it('rejects file without data rows', async () => {
    const { service } = setup();
    await expect(service.runStock(csv('sku,price\n'), { sku: 0, price: 1 })).rejects.toThrow(BadRequestException);
  });

  it('updates by SKU, collects notFound, skips invalid values', async () => {
    const { service, prisma, cache } = setup();
    prisma.productVariant.findUnique.mockImplementation(({ where }: any) =>
      where.sku === 'MISSING' ? null : { id: 1 });
    const res = await service.runStock(
      csv('sku,price,qty\nA,"10,5",3\nMISSING,1,1\n,5,5\nB,abc,x\nC,abc,4\n'),
      { sku: 0, price: 1, stockQty: 2 },
    );
    expect(prisma.productVariant.update).toHaveBeenCalledWith({ where: { sku: 'A' }, data: { price: 10.5, stockQty: 3 } });
    expect(prisma.productVariant.update).toHaveBeenCalledWith({ where: { sku: 'C' }, data: { stockQty: 4 } });
    expect(prisma.productVariant.update).toHaveBeenCalledTimes(2); // B has no valid values
    expect(res).toEqual({ updated: 2, notFoundCount: 1, notFound: ['MISSING'] });
    expect(cache.invalidateProduct).toHaveBeenCalled();
  });

  it('detects XLSX by PK signature', async () => {
    const { service, prisma } = setup();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['sku', 'qty'], ['X1', 9], [], ['X2', 1]]), 'S');
    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    expect(buf.subarray(0, 2).toString()).toBe('PK');
    prisma.productVariant.findUnique.mockResolvedValue({ id: 1 });
    const res = await service.runStock(buf, { sku: 0, stockQty: 1 }, 'noext');
    expect(prisma.productVariant.update).toHaveBeenCalledWith({ where: { sku: 'X1' }, data: { stockQty: 9 } });
    expect(res.updated).toBe(2);
    expect(service.preview(buf).totalRows).toBe(2); // empty row dropped
  });
});

const yml = (offers: string) => Buffer.from(`<yml_catalog><shop>
<categories><category id="1">Одяг</category><category id="2" parentId="1">Сукні</category></categories>
<offers>${offers}</offers></shop></yml_catalog>`);

describe('ImportService.runYml', () => {
  it('throws without offers', async () => {
    const { service } = setup();
    await expect(service.runYml(yml(''))).rejects.toThrow(BadRequestException);
  });

  it('creates product with variants for a group (categories, sizes, colors, stock 0 when unavailable)', async () => {
    const { service, prisma, cache } = setup();
    prisma.productVariant.findMany.mockResolvedValue([]);
    prisma.category.findFirst.mockResolvedValue(null);
    let catId = 100;
    prisma.category.create.mockImplementation(async () => ({ id: ++catId }));
    prisma.category.findUnique.mockImplementation(async ({ where }: any) =>
      where.id ? { productType: 'CLOTHING' } : null);
    prisma.product.findUnique.mockResolvedValue(null);
    prisma.product.create.mockResolvedValue({ id: 7 });
    prisma.size.findFirst.mockResolvedValue(null);
    prisma.size.create.mockImplementation(async ({ data }: any) => ({ id: data.name === 'S' ? 1 : 2 }));
    prisma.color.findFirst.mockResolvedValue({ id: 5 });

    const res = await service.runYml(yml(`
      <offer id="1" group_id="G"><name>Сукня</name><vendorCode>S1</vendorCode><price>100</price><categoryId>2</categoryId>
        <param name="Розмір">S</param><param name="Колір">Red</param><stock_quantity>3</stock_quantity></offer>
      <offer id="2" group_id="G" available="false"><name>Сукня</name><vendorCode>S2</vendorCode><price>100</price>
        <param name="Розмір">M</param><param name="Колір">Red</param></offer>`));

    expect(res).toEqual({ created: 2, updated: 0, errors: [] });
    expect(prisma.product.create).toHaveBeenCalledTimes(1);
    expect(prisma.product.create.mock.calls[0][0].data).toMatchObject({ name: 'Сукня', slug: 'suknia', categoryId: 102, basePrice: 100 });
    // parent created first, child gets parentId
    expect(prisma.category.create.mock.calls[0][0].data).toMatchObject({ name: 'Одяг', parentId: undefined });
    expect(prisma.category.create.mock.calls[1][0].data).toMatchObject({ name: 'Сукні', parentId: 101 });
    const variants = prisma.productVariant.create.mock.calls.map((c: any) => c[0].data);
    expect(variants).toEqual([
      expect.objectContaining({ productId: 7, sku: 'S1', stockQty: 3, sizeId: 1, colorId: 5 }),
      expect.objectContaining({ productId: 7, sku: 'S2', stockQty: 0, sizeId: 2, colorId: 5 }),
    ]);
    expect(prisma.color.findFirst).toHaveBeenCalledTimes(1); // cached
    expect(cache.invalidateProduct).toHaveBeenCalled();
  });

  it('updates existing product/variants by SKU', async () => {
    const { service, prisma, cache } = setup();
    prisma.productVariant.findMany.mockResolvedValue([{ sku: 'S1', productId: 9 }]);
    prisma.product.update.mockResolvedValue({ productType: 'CLOTHING' });
    const res = await service.runYml(yml(
      `<offer id="1" available="false"><name>N</name><vendorCode>S1</vendorCode><price>50</price><oldprice>70</oldprice></offer>`));
    expect(res).toEqual({ created: 0, updated: 1, errors: [] });
    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 9 }, data: { name: 'N', basePrice: 50, oldPrice: 70 } }));
    expect(prisma.productVariant.update).toHaveBeenCalledWith({ where: { sku: 'S1' }, data: { price: 50, stockQty: 0 } });
    expect(prisma.product.create).not.toHaveBeenCalled();
    expect(cache.invalidateProduct).toHaveBeenCalled();
  });

  it('reports errors for missing category / price without aborting', async () => {
    const { service, prisma } = setup();
    prisma.productVariant.findMany.mockResolvedValue([]);
    prisma.category.findFirst.mockResolvedValue({ id: 1 });
    const res = await service.runYml(yml(
      `<offer id="1"><name>A</name><price>1</price></offer><offer id="2"><name>B</name><categoryId>1</categoryId></offer>`));
    expect(res.created).toBe(0);
    expect(res.errors).toEqual(['1: категорію не знайдено', '2: немає ціни']);
  });
});

// Кодирование в windows-1251 для имитации выгрузки 1С (в Node нет встроенного энкодера)
const cp1251 = (text: string) => {
  const dec = new TextDecoder('windows-1251');
  const map = new Map<string, number>();
  for (let b = 0; b < 256; b++) map.set(dec.decode(Uint8Array.of(b)), b);
  return Buffer.from([...text].map((ch) => map.get(ch) ?? 0x3f));
};

function productMocks(prisma: any) {
  prisma.productVariant.findMany.mockResolvedValue([]);
  prisma.category.findFirst.mockResolvedValue(null);
  let catId = 100;
  prisma.category.create.mockImplementation(async () => ({ id: ++catId }));
  prisma.category.findUnique.mockImplementation(async ({ where }: any) => (where.id ? { productType: 'CLOTHING' } : null));
  prisma.product.findUnique.mockResolvedValue(null);
  let productId = 0;
  prisma.product.create.mockImplementation(async () => ({ id: ++productId }));
  prisma.size.findFirst.mockResolvedValue(null);
  prisma.size.create.mockImplementation(async ({ data }: any) => ({ id: data.name.charCodeAt(0) }));
  prisma.color.findFirst.mockResolvedValue({ id: 5 });
}

describe('ImportService.runProducts', () => {
  const mapping = { sku: 0, name: 1, category: 2, price: 3, stockQty: 4, size: 5, color: 6 };

  it('requires sku and name columns', async () => {
    const { service } = setup();
    await expect(service.runProducts(csv('a\n1'), { sku: 0 })).rejects.toThrow(BadRequestException);
  });

  it('1С CSV: windows-1251, ";" separator, "1 234,50" prices -> one product with size variants', async () => {
    const { service, prisma } = setup();
    productMocks(prisma);
    const file = cp1251(
      'Артикул;Найменування;Категорія;Ціна;Залишок;Розмір;Колір\r\n'
      + 'D-1-S;Сукня льон;Жінкам > Сукні;1 234,50;3;S;Бежевий\r\n'
      + 'D-1-M;Сукня льон;Жінкам > Сукні;1 234,50;0;M;Бежевий\r\n'
      + ';без артикула;;;;;\r\n',
    );

    const res = await service.runProducts(file, mapping, 'export.csv');

    expect(res).toEqual({ created: 2, updated: 0, errors: [] });
    expect(prisma.product.create).toHaveBeenCalledTimes(1);
    expect(prisma.product.create.mock.calls[0][0].data).toMatchObject({ name: 'Сукня льон', basePrice: 1234.5, categoryId: 102 });
    expect(prisma.category.create.mock.calls.map((c: any) => c[0].data)).toEqual([
      expect.objectContaining({ name: 'Жінкам', parentId: undefined }),
      expect.objectContaining({ name: 'Сукні', parentId: 101 }),
    ]);
    expect(prisma.productVariant.create.mock.calls.map((c: any) => c[0].data)).toEqual([
      expect.objectContaining({ sku: 'D-1-S', price: 1234.5, stockQty: 3, colorId: 5 }),
      expect.objectContaining({ sku: 'D-1-M', price: 1234.5, stockQty: 0, colorId: 5 }),
    ]);
  });

  it('Google Sheets XLSX: numeric cells, group column splits products, re-import updates by SKU', async () => {
    const { service, prisma } = setup();
    productMocks(prisma);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['SKU', 'Name', 'Category', 'Price', 'Qty', 'Size', 'Color', 'Model'],
      ['T-1', 'Футболка', 'Чоловікам', 499, 10, 'M', 'Black', 'tee-black'],
      ['T-2', 'Футболка', 'Чоловікам', 499, 5, 'M', 'White', 'tee-white'],
    ]), 'Sheet1');
    const buf: Buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const res = await service.runProducts(buf, { ...mapping, group: 7 }, 'Каталог.xlsx');
    expect(res).toEqual({ created: 2, updated: 0, errors: [] });
    expect(prisma.product.create).toHaveBeenCalledTimes(2);

    // повторный импорт того же файла — обновление, без дублей
    prisma.product.create.mockClear();
    prisma.productVariant.findMany.mockImplementation(async ({ where }: any) =>
      where.sku.in.map((sku: string) => ({ sku, productId: 1 })));
    prisma.product.update.mockResolvedValue({ productType: 'CLOTHING' });
    const again = await service.runProducts(buf, { ...mapping, group: 7 }, 'Каталог.xlsx');
    expect(again).toEqual({ created: 0, updated: 2, errors: [] });
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
});

describe('ImportService.importPhotos', () => {
  const file = (name: string) => ({ originalname: name, buffer: Buffer.from('x'), mimetype: 'image/jpeg', size: 1 }) as any;

  it('matches files to variants by SKU (with _N suffix), first photo becomes main', async () => {
    const { service, prisma, files } = setup();
    prisma.productVariant.findUnique.mockImplementation(async ({ where }: any) =>
      (where.sku === 'D-1-S' ? { id: 1, productId: 7 } : null));
    let media = 0;
    prisma.productMedia.findFirst.mockImplementation(async () => (media ? { sortOrder: media - 1 } : null));
    prisma.productMedia.create.mockImplementation(async () => { media++; });
    let fileId = 40;
    files.upload.mockImplementation(async () => ({ id: ++fileId, fileType: 'IMAGE' }));

    const res = await service.importPhotos([file('D-1-S_2.jpg'), file('nope.jpg'), file('D-1-S.jpg')]);

    expect(res).toEqual({ attached: 2, notFound: ['nope.jpg'], errors: [] });
    expect(files.upload.mock.calls.map((c: any) => c[0].originalname)).toEqual(['D-1-S.jpg', 'D-1-S_2.jpg']);
    expect(prisma.productMedia.create.mock.calls.map((c: any) => c[0].data)).toEqual([
      expect.objectContaining({ productId: 7, fileId: 41, sortOrder: 0, isMain: true }),
      expect.objectContaining({ productId: 7, fileId: 42, sortOrder: 1, isMain: false }),
    ]);
  });
});
