import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { GetAdminPagesQueryDto } from './dto/get-admin-pages.query.dto';

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminPages(query: GetAdminPagesQueryDto) {
    return this.prisma.pageContent.findMany({
      where: { isActive: query.isActive },
      orderBy: { slug: 'asc' },
    });
  }

  async getAdminPageBySlug(slug: string) {
    const page = await this.prisma.pageContent.findUnique({
      where: { slug },
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    return page;
  }

  async createPage(dto: CreatePageDto) {
    const existing = await this.prisma.pageContent.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException(`Page with slug "${dto.slug}" already exists`);
    }

    return this.prisma.pageContent.create({
      data: {
        slug: dto.slug,
        title: dto.title,
        contentJson: dto.contentJson ?? Prisma.JsonNull,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updatePage(slug: string, dto: UpdatePageDto) {
    await this.getAdminPageBySlug(slug);

    return this.prisma.pageContent.update({
      where: { slug },
      data: {
        title: dto.title,
        contentJson: dto.contentJson,
        metaTitle: dto.metaTitle,
        metaDescription: dto.metaDescription,
        isActive: dto.isActive,
      },
    });
  }

  async getStorefrontPage(slug: string) {
    const page = await this.prisma.pageContent.findUnique({
      where: { slug, isActive: true },
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    return page;
  }
}
