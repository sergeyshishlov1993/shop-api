import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service';

type FeedItem = {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  availability: 'in stock' | 'out of stock';
  price: string;
  brand: string;
  currency: string;
};

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function csvEscape(value: string): string {
  const v = value.replace(/"/g, '""');
  return `"${v}"`;
}

@Injectable()
export class FeedService {
  private readonly frontendUrl: string;
  private readonly s3Base: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.frontendUrl = (this.config.get<string>('FRONTEND_URL') ?? '').replace(/\/$/, '');
    const endpoint = (this.config.get<string>('S3_ENDPOINT') ?? '').replace(/\/$/, '');
    const bucket = this.config.get<string>('S3_BUCKET') ?? 'shop';
    this.s3Base = `${endpoint}/${bucket}`;
  }

  private async buildItems(): Promise<FeedItem[]> {
    const currency =
      (await this.prisma.storeSettings.findFirst({ select: { currency: true } }))?.currency ?? 'UAH';

    const products = await this.prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
      select: {
        id: true, name: true, slug: true, description: true, brand: true, basePrice: true,
        variants: {
          where: { isActive: true, deletedAt: null },
          select: { price: true, stockQty: true, reservedQty: true },
        },
        media: {
          where: { isMain: true },
          select: { file: { select: { s3KeyLarge: true, s3Key: true } } },
          take: 1,
        },
      },
    });

    const items: FeedItem[] = [];
    for (const p of products) {
      const prices = p.variants.map((v) => v.price ?? p.basePrice);
      const minPrice = prices.length ? Math.min(...prices) : p.basePrice;
      const available = p.variants.some((v) => v.stockQty - v.reservedQty > 0);
      const key = p.media[0]?.file?.s3KeyLarge ?? p.media[0]?.file?.s3Key;
      if (!key) continue; // без картинки Merchant всё равно отклонит

      items.push({
        id: String(p.id),
        title: p.name,
        description: (p.description ?? p.name).slice(0, 4000),
        link: `${this.frontendUrl}/product/${p.slug}`,
        imageLink: `${this.s3Base}/${key}`,
        availability: available ? 'in stock' : 'out of stock',
        price: `${minPrice.toFixed(2)} ${currency}`,
        brand: p.brand ?? '',
        currency,
      });
    }
    return items;
  }

  /** Google Merchant (Google Shopping) — RSS 2.0. */
  async googleXml(): Promise<string> {
    const items = await this.buildItems();
    const body = items
      .map(
        (i) => `    <item>
      <g:id>${xmlEscape(i.id)}</g:id>
      <title>${xmlEscape(i.title)}</title>
      <description>${xmlEscape(i.description)}</description>
      <link>${xmlEscape(i.link)}</link>
      <g:image_link>${xmlEscape(i.imageLink)}</g:image_link>
      <g:availability>${i.availability}</g:availability>
      <g:price>${xmlEscape(i.price)}</g:price>
      <g:brand>${xmlEscape(i.brand)}</g:brand>
      <g:condition>new</g:condition>
      <g:identifier_exists>no</g:identifier_exists>
    </item>`,
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Product feed</title>
    <link>${xmlEscape(this.frontendUrl)}</link>
    <description>Google Merchant feed</description>
${body}
  </channel>
</rss>`;
  }

  /** Meta (Facebook/Instagram) catalog — CSV. */
  async facebookCsv(): Promise<string> {
    const items = await this.buildItems();
    const header = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand'];
    const rows = items.map((i) =>
      [
        i.id,
        i.title,
        i.description,
        i.availability,
        'new',
        i.price,
        i.link,
        i.imageLink,
        i.brand,
      ]
        .map((v) => csvEscape(String(v)))
        .join(','),
    );
    return [header.join(','), ...rows].join('\n');
  }
}
