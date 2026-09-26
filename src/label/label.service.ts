import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { code128Svg } from './code128';

export type LabelRequestItem = { variantId: number; copies?: number };

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

@Injectable()
export class LabelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  /** Генерирует печатный HTML-лист ценников со штрихкодами. */
  async renderLabels(items: LabelRequestItem[]): Promise<string> {
    if (!items?.length) throw new BadRequestException('Не вибрано жодного варіанту.');

    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: items.map((i) => i.variantId) } },
      select: {
        id: true, sku: true, barcode: true, price: true,
        product: {
          select: {
            name: true,
            basePrice: true,
            material: true,
            season: true,
            media: {
              where: { isMain: true },
              orderBy: { sortOrder: 'asc' },
              take: 1,
              select: { file: { select: { s3Key: true, s3KeyMedium: true, s3KeyLarge: true } } },
            },
          },
        },
        size: { select: { name: true } },
        color: { select: { name: true } },
      },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    const currency =
      (await this.prisma.storeSettings.findFirst({ select: { currency: true } }))?.currency ?? 'UAH';

    const cells: string[] = [];
    for (const item of items) {
      const v = byId.get(item.variantId);
      if (!v) continue;
      const copies = Math.max(1, Math.min(item.copies ?? 1, 200));
      const price = v.price ?? v.product.basePrice;
      const code = v.barcode?.trim() || v.sku;
      const { svg } = code128Svg(code, { moduleWidth: 1.4, height: 42 });
      const attrs = [
        v.size?.name && `Розмір: ${v.size.name}`,
        v.color?.name && `Колір: ${v.color.name}`,
        v.product.material && `Матеріал: ${v.product.material}`,
        v.product.season && `Сезон: ${v.product.season}`,
      ].filter(Boolean).join(' · ');
      const file = v.product.media[0]?.file;
      const imageKey = file?.s3KeyMedium ?? file?.s3KeyLarge ?? file?.s3Key;
      const imageUrl = imageKey ? this.s3Service.getPublicUrl(imageKey) : '';

      const cell = `
        <div class="label">
          <div class="label-head">
            ${imageUrl ? `<img class="photo" src="${esc(imageUrl)}" alt="${esc(v.product.name)}">` : '<div class="photo photo--empty"></div>'}
            <div class="label-copy">
              <div class="name">${esc(v.product.name)}</div>
              ${attrs ? `<div class="attrs">${esc(attrs)}</div>` : ''}
            </div>
          </div>
          <div class="price">${price.toFixed(2)} ${esc(currency)}</div>
          <div class="barcode">${svg}</div>
          <div class="code">${esc(code)}</div>
        </div>`;
      for (let i = 0; i < copies; i++) cells.push(cell);
    }

    if (cells.length === 0) throw new BadRequestException('Варіанти не знайдено.');

    return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<title>Цінники</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
  .toolbar { padding: 12px 16px; background: #f4f4f4; }
  .toolbar button { padding: 8px 16px; font-size: 14px; cursor: pointer; }
  .sheet { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4mm; padding: 8mm; }
  .label { border: 1px solid #111; padding: 6px 8px; text-align: center; page-break-inside: avoid; }
  .label-head { display: flex; gap: 7px; min-height: 54px; text-align: left; }
  .photo { flex: 0 0 42px; width: 42px; height: 54px; object-fit: cover; background: #eee; }
  .photo--empty { display: block; }
  .label-copy { min-width: 0; flex: 1; }
  .name { font-size: 10px; font-weight: 600; line-height: 1.2; height: 25px; overflow: hidden; }
  .attrs { font-size: 8px; line-height: 1.25; color: #555; max-height: 28px; overflow: hidden; }
  .price { font-size: 17px; font-weight: 700; margin: 5px 0 3px; }
  .barcode svg { width: 100%; height: 42px; }
  .code { font-size: 9px; letter-spacing: 1px; }
  @media print { .toolbar { display: none; } .sheet { padding: 0; } }
</style>
</head>
<body>
  <div class="toolbar"><button onclick="window.print()">Друкувати</button> &nbsp; Ярликів: ${cells.length}</div>
  <div class="sheet">${cells.join('')}</div>
</body>
</html>`;
  }
}
