import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma/prisma.service';
import { FileService } from '../file/file.service';
import {
  CreateInstagramPostDto,
  CreateInstagramPostFromLinkDto,
  UpdateInstagramPostDto,
} from './dto/instagram.dto';

const fileSelect = {
  select: { id: true, s3Key: true, s3KeyThumb: true, s3KeyMedium: true, s3KeyLarge: true },
};

const INSTAGRAM_LINK_REGEX = /^https:\/\/(www\.)?instagram\.com\/(p|reel)\/([A-Za-z0-9_-]+)/;
const FETCH_TIMEOUT_MS = 10_000;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const IMAGE_MAX_SIZE = 10 * 1024 * 1024;
const INSTAGRAM_USER_AGENT =
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

type PageInfo = { isVideo: boolean; likes: number | null; comments: number | null };

// «1,234» → 1234, «1.2K» → 1200, «3M» → 3000000
function parseCount(raw?: string): number | null {
  if (!raw) return null;
  const multiplier = /k$/i.test(raw) ? 1_000 : /m$/i.test(raw) ? 1_000_000 : 1;
  const value = multiplier > 1 ? parseFloat(raw.replace(',', '.')) : parseInt(raw.replace(/[.,]/g, ''), 10);
  return Number.isFinite(value) ? Math.round(value * multiplier) : null;
}

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly fileService: FileService,
  ) {}

  listStorefront() {
    return this.prisma.instagramPost.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, link: true, isVideo: true, likesCount: true, commentsCount: true, sortOrder: true, file: fileSelect },
    });
  }

  listAdmin() {
    return this.prisma.instagramPost.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, link: true, isVideo: true, likesCount: true, commentsCount: true, statsUpdatedAt: true, sortOrder: true, isActive: true, file: fileSelect },
    });
  }

  async create(dto: CreateInstagramPostDto, info?: PageInfo) {
    const pageInfo = info ?? (dto.link ? await this.fetchPageInfo(dto.link) : null);
    return this.prisma.instagramPost.create({
      data: {
        ...dto,
        isVideo: /instagram\.com\/reel\//.test(dto.link ?? '') || Boolean(pageInfo?.isVideo),
        ...(pageInfo ? { likesCount: pageInfo.likes, commentsCount: pageInfo.comments, statsUpdatedAt: new Date() } : {}),
      },
    });
  }

  // Щоденне оновлення лайків/коментарів усіх постів із посиланням
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async refreshAllStats() {
    const posts = await this.prisma.instagramPost.findMany({ where: { link: { not: null } }, select: { id: true, link: true } });
    let updated = 0;
    for (const post of posts) {
      const info = await this.fetchPageInfo(post.link!);
      if (!info || (info.likes === null && info.comments === null)) continue;
      await this.prisma.instagramPost.update({
        where: { id: post.id },
        data: { likesCount: info.likes, commentsCount: info.comments, statsUpdatedAt: new Date() },
      });
      updated += 1;
    }
    this.logger.log(`Instagram stats refreshed: ${updated}/${posts.length}`);
    return { updated, total: posts.length };
  }

  async createFromLink(dto: CreateInstagramPostFromLinkDto) {
    const match = dto.link.match(INSTAGRAM_LINK_REGEX);
    if (!match) {
      throw new BadRequestException('Не вдалося отримати фото з Instagram — завантажте фото вручну');
    }
    const normalizedLink = `https://www.instagram.com/p/${match[3]}/`;

    // Спершу повнорозмірне фото без кропу (/media/?size=l редиректить на оригінал 1080px, напр. 1080×1440);
    // якщо не вдалося — квадратне превʼю з og:image.
    let imageFile: Express.Multer.File;
    try {
      imageFile = await this.downloadImage(`${normalizedLink}media/?size=l`);
    } catch {
      imageFile = await this.downloadImage(await this.fetchOgImage(normalizedLink));
    }
    const uploaded = await this.fileService.upload(imageFile);

    const info = await this.fetchPageInfo(normalizedLink);
    return this.create(
      { fileId: uploaded.id, link: normalizedLink, sortOrder: dto.sortOrder },
      { isVideo: match[2] === 'reel' || Boolean(info?.isVideo), likes: info?.likes ?? null, comments: info?.comments ?? null },
    );
  }

  // Дані з публічної сторінки поста: чи відео, лайки й коментарі (з og:description «399 likes, 669 comments - …»).
  // Помилка мережі → null.
  private async fetchPageInfo(link: string): Promise<PageInfo | null> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(link, { headers: { 'User-Agent': INSTAGRAM_USER_AGENT }, signal: controller.signal });
        const html = await res.text();
        const description = html.match(/<meta property="og:description" content="([^"]*)"/)?.[1] ?? '';
        return {
          isVideo: /property="og:video|"is_video":true|og:type" content="video/.test(html),
          likes: parseCount(description.match(/([\d.,]+[KkMm]?)\s+likes?/)?.[1]),
          comments: parseCount(description.match(/([\d.,]+[KkMm]?)\s+comments?/)?.[1]),
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return null;
    }
  }

  private async fetchOgImage(link: string): Promise<string> {
    let html: string;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        const res = await fetch(link, {
          headers: { 'User-Agent': INSTAGRAM_USER_AGENT },
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error(`status ${res.status}`);
        }
        html = await res.text();
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      throw new BadRequestException('Не вдалося отримати фото з Instagram — завантажте фото вручну');
    }

    const match = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (!match) {
      throw new BadRequestException('Не вдалося отримати фото з Instagram — завантажте фото вручну');
    }
    return match[1].replace(/&amp;/g, '&');
  }

  private async downloadImage(imageUrl: string): Promise<Express.Multer.File> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
      try {
        const res = await fetch(imageUrl, { signal: controller.signal });
        if (!res.ok) {
          throw new Error(`status ${res.status}`);
        }
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.startsWith('image/')) {
          throw new Error('not an image');
        }
        const arrayBuffer = await res.arrayBuffer();
        if (arrayBuffer.byteLength > IMAGE_MAX_SIZE) {
          throw new Error('too large');
        }
        const buffer = Buffer.from(arrayBuffer);
        return {
          buffer,
          size: buffer.length,
          mimetype: contentType,
          originalname: 'instagram.jpg',
        } as Express.Multer.File;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      throw new BadRequestException('Не вдалося отримати фото з Instagram — завантажте фото вручну');
    }
  }

  async update(id: number, dto: UpdateInstagramPostDto) {
    await this.getOrThrow(id);
    return this.prisma.instagramPost.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.getOrThrow(id);
    await this.prisma.instagramPost.delete({ where: { id } });
    return { success: true };
  }

  private async getOrThrow(id: number) {
    const post = await this.prisma.instagramPost.findUnique({ where: { id } });
    if (!post) throw new NotFoundException('Пост не знайдено.');
    return post;
  }
}
