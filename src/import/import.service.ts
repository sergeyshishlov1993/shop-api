import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { ProductType, SizeType } from '@prisma/client';
import * as XLSX from 'xlsx';
import { FileService } from '../file/file.service';
import { parseCsv } from './csv.util';
import { parseYml, YmlOffer } from './yml.util';
import { uniqueSlug } from './slug.util';

export type StockMapping = { sku: number; price?: number; stockQty?: number };

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly fileService: FileService,
  ) {}

  private rowsFrom(buffer: Buffer, fileName = ''): string[][] {
    // XLSX — zip-архив (сигнатура PK)
    const isXlsx = /\.xlsx$/i.test(fileName) || buffer.subarray(0, 2).toString() === 'PK';
    const rows = isXlsx ? this.xlsxRows(buffer) : parseCsv(buffer.toString('utf-8'));
    if (rows.length < 2) throw new BadRequestException('Файл порожній або без даних.');
    return rows;
  }

  private xlsxRows(buffer: Buffer): string[][] {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return [];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' });
    return rows.map((r) => r.map((c) => String(c ?? ''))).filter((r) => r.some((c) => c.trim() !== ''));
  }

  preview(buffer: Buffer, fileName?: string) {
    const rows = this.rowsFrom(buffer, fileName);
    return {
      headers: rows[0],
      sampleRows: rows.slice(1, 6),
      totalRows: rows.length - 1,
    };
  }

  async runStock(buffer: Buffer, mapping: StockMapping, fileName?: string) {
    if (mapping.sku === undefined || Number.isNaN(mapping.sku)) {
      throw new BadRequestException('Не вказано колонку SKU.');
    }
    if (mapping.price === undefined && mapping.stockQty === undefined) {
      throw new BadRequestException('Оберіть хоча б одну колонку: ціна або залишок.');
    }

    const rows = this.rowsFrom(buffer, fileName).slice(1);
    let updated = 0;
    const notFound: string[] = [];

    for (const r of rows) {
      const sku = (r[mapping.sku] ?? '').trim();
      if (!sku) continue;

      const variant = await this.prisma.productVariant.findUnique({ where: { sku }, select: { id: true } });
      if (!variant) { notFound.push(sku); continue; }

      const data: { price?: number; stockQty?: number } = {};
      if (mapping.price !== undefined) {
        const p = Number(String(r[mapping.price]).replace(',', '.'));
        if (!Number.isNaN(p)) data.price = p;
      }
      if (mapping.stockQty !== undefined) {
        const s = parseInt(String(r[mapping.stockQty]), 10);
        if (!Number.isNaN(s)) data.stockQty = s;
      }
      if (Object.keys(data).length > 0) {
        await this.prisma.productVariant.update({ where: { sku }, data });
        updated++;
      }
    }

    await this.cacheService.invalidateProduct();
    return { updated, notFoundCount: notFound.length, notFound: notFound.slice(0, 50) };
  }

  async runYml(buffer: Buffer) {
    const { categories, offers } = parseYml(buffer.toString('utf-8'));
    if (offers.length === 0) throw new BadRequestException('У файлі немає товарів (offer).');

    const errors: string[] = [];
    let created = 0;
    let updated = 0;

    // YML id категории -> id в БД (по имени, создаём при отсутствии; родители раньше детей)
    const catIds = new Map<string, number>();
    const resolveCategory = async (ymlId: string, depth = 0): Promise<number | undefined> => {
      if (catIds.has(ymlId)) return catIds.get(ymlId);
      const c = categories.find((x) => x.id === ymlId);
      if (!c || !c.name || depth > 20) return undefined;
      const parentId = c.parentId ? await resolveCategory(c.parentId, depth + 1) : undefined;
      const existing = await this.prisma.category.findFirst({ where: { name: c.name, deletedAt: null }, select: { id: true } });
      const id = existing?.id ?? (await this.prisma.category.create({
        data: {
          name: c.name,
          parentId,
          slug: await uniqueSlug(c.name, async (slug) => !!(await this.prisma.category.findUnique({ where: { slug }, select: { id: true } }))),
        },
      })).id;
      catIds.set(ymlId, id);
      return id;
    };

    const sizeIds = new Map<string, number>();
    const colorIds = new Map<string, number>();
    const sizeId = async (name: string, sizeType: SizeType) => {
      const key = `${sizeType}:${name}`;
      if (!sizeIds.has(key)) {
        const s = await this.prisma.size.findFirst({ where: { name, sizeType } })
          ?? await this.prisma.size.create({ data: { name, sizeType } });
        sizeIds.set(key, s.id);
      }
      return sizeIds.get(key)!;
    };
    const colorId = async (name: string) => {
      if (!colorIds.has(name)) {
        const c = await this.prisma.color.findFirst({ where: { name } }) ?? await this.prisma.color.create({ data: { name } });
        colorIds.set(name, c.id);
      }
      return colorIds.get(name)!;
    };

    // Офферы с одним group_id — один товар с несколькими вариантами
    const groups = new Map<string, YmlOffer[]>();
    for (const o of offers) {
      const key = o.groupId ? `g:${o.groupId}` : `o:${o.id}`;
      groups.set(key, [...(groups.get(key) ?? []), o]);
    }

    for (const group of groups.values()) {
      const first = group[0];
      try {
        const skus = group.map((o) => o.sku);
        const existing = await this.prisma.productVariant.findMany({ where: { sku: { in: skus } }, select: { sku: true, productId: true } });
        let productId = existing[0]?.productId;
        let productType: ProductType = ProductType.CLOTHING;

        if (productId) {
          const p = await this.prisma.product.update({
            where: { id: productId },
            data: { name: first.name || undefined, basePrice: first.price, oldPrice: first.oldPrice },
            select: { productType: true },
          });
          productType = p.productType;
        } else {
          const categoryId = first.categoryId ? await resolveCategory(first.categoryId) : undefined;
          if (!categoryId) { errors.push(`${first.sku}: категорію не знайдено`); continue; }
          if (first.price === undefined) { errors.push(`${first.sku}: немає ціни`); continue; }
          const cat = await this.prisma.category.findUnique({ where: { id: categoryId }, select: { productType: true } });
          productType = cat?.productType ?? ProductType.CLOTHING;
          const product = await this.prisma.product.create({
            data: {
              name: first.name,
              slug: await uniqueSlug(first.name, async (slug) => !!(await this.prisma.product.findUnique({ where: { slug }, select: { id: true } }))),
              description: first.description,
              productType,
              categoryId,
              brand: first.vendor,
              basePrice: first.price,
              oldPrice: first.oldPrice,
            },
          });
          productId = product.id;
          await this.importPictures(productId, [...new Set(group.flatMap((o) => o.pictures))], errors);
        }

        for (const o of group) {
          const stockQty = o.stockQty ?? (o.available ? undefined : 0);
          if (existing.some((e) => e.sku === o.sku)) {
            await this.prisma.productVariant.update({ where: { sku: o.sku }, data: { price: o.price, stockQty } });
            updated++;
          } else {
            await this.prisma.productVariant.create({
              data: {
                productId,
                sku: o.sku,
                price: o.price,
                stockQty,
                sizeId: o.size ? await sizeId(o.size, productType as SizeType) : undefined,
                colorId: o.color ? await colorId(o.color) : undefined,
              },
            });
            created++;
          }
        }
      } catch (e) {
        errors.push(`${first.sku}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await this.cacheService.invalidateProduct();
    return { created, updated, errors: errors.slice(0, 100) };
  }

  // Скачивание картинок и загрузка через FileService; ошибки не прерывают импорт
  private async importPictures(productId: number, urls: string[], errors: string[]) {
    let sortOrder = 0;
    for (const url of urls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const mimetype = (res.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim();
        const file = await this.fileService.upload({
          buffer, mimetype, size: buffer.length, originalname: url.split('/').pop() || 'image.jpg',
        } as Express.Multer.File);
        await this.prisma.productMedia.create({
          data: { productId, fileId: file.id, mediaType: 'IMAGE', sortOrder, isMain: sortOrder === 0 },
        });
        sortOrder++;
      } catch (e) {
        errors.push(`Фото ${url}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
}
