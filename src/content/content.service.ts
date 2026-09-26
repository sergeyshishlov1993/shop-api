import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FileType, MediaType } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateHeroSlideDto } from './dto/create-hero-slide.dto';
import { UpdateHeroSlideDto } from './dto/update-hero-slide.dto';

@Injectable()
export class ContentService {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminHeroSlides() {
    return this.prisma.heroSlide.findMany({
      include: {
        mediaFile: {
          select: {
            id: true,
            fileType: true,
            originalName: true,
            mimeType: true,
            s3Key: true,
            s3KeyThumb: true,
            s3KeyMedium: true,
            s3KeyLarge: true,
            previewFileId: true,
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async getStorefrontHeroSlides() {
    return this.prisma.heroSlide.findMany({
      where: {
        isActive: true,
      },
      include: {
        mediaFile: {
          select: {
            id: true,
            fileType: true,
            originalName: true,
            mimeType: true,
            s3Key: true,
            s3KeyThumb: true,
            s3KeyMedium: true,
            s3KeyLarge: true,
            previewFileId: true,
          },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }

  async createHeroSlide(dto: CreateHeroSlideDto) {
    await this.validateHeroSlideMedia(dto.mediaFileId, dto.mediaType);

    return this.prisma.heroSlide.create({
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        buttonText: dto.buttonText,
        buttonLink: dto.buttonLink,
        mediaFileId: dto.mediaFileId,
        mediaType: dto.mediaType,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
        focalX: dto.focalX ?? 0.5,
        focalY: dto.focalY ?? 0.5,
        // Якщо планшет/телефон не задані — стартуємо з десктопної точки.
        focalXTablet: dto.focalXTablet ?? dto.focalX ?? 0.5,
        focalYTablet: dto.focalYTablet ?? dto.focalY ?? 0.5,
        focalXMobile: dto.focalXMobile ?? dto.focalX ?? 0.5,
        focalYMobile: dto.focalYMobile ?? dto.focalY ?? 0.5,
      },
      include: {
        mediaFile: {
          select: {
            id: true,
            fileType: true,
            originalName: true,
            mimeType: true,
            s3Key: true,
            s3KeyThumb: true,
            s3KeyMedium: true,
            s3KeyLarge: true,
            previewFileId: true,
          },
        },
      },
    });
  }

  async updateHeroSlide(id: number, dto: UpdateHeroSlideDto) {
    const heroSlide = await this.findHeroSlideByIdOrThrow(id);

    if (dto.mediaFileId !== undefined || dto.mediaType !== undefined) {
      await this.validateHeroSlideMedia(dto.mediaFileId ?? heroSlide.mediaFileId, dto.mediaType ?? heroSlide.mediaType);
    }

    return this.prisma.heroSlide.update({
      where: { id },
      data: {
        title: dto.title,
        subtitle: dto.subtitle,
        buttonText: dto.buttonText,
        buttonLink: dto.buttonLink,
        mediaFileId: dto.mediaFileId,
        mediaType: dto.mediaType,
        isActive: dto.isActive,
        sortOrder: dto.sortOrder,
        focalX: dto.focalX,
        focalY: dto.focalY,
        focalXTablet: dto.focalXTablet,
        focalYTablet: dto.focalYTablet,
        focalXMobile: dto.focalXMobile,
        focalYMobile: dto.focalYMobile,
      },
      include: {
        mediaFile: {
          select: {
            id: true,
            fileType: true,
            originalName: true,
            mimeType: true,
            s3Key: true,
            s3KeyThumb: true,
            s3KeyMedium: true,
            s3KeyLarge: true,
            previewFileId: true,
          },
        },
      },
    });
  }

  async deleteHeroSlide(id: number) {
    await this.findHeroSlideByIdOrThrow(id);

    await this.prisma.heroSlide.delete({
      where: { id },
    });

    return { message: 'Hero slide deleted' };
  }

  private async findHeroSlideByIdOrThrow(id: number) {
    const heroSlide = await this.prisma.heroSlide.findUnique({
      where: { id },
    });

    if (!heroSlide) {
      throw new NotFoundException('Hero slide not found');
    }

    return heroSlide;
  }

  private async validateHeroSlideMedia(mediaFileId: number, mediaType: MediaType) {
    const fileAsset = await this.prisma.fileAsset.findUnique({
      where: { id: mediaFileId },
    });

    if (!fileAsset) {
      throw new BadRequestException('Media file not found');
    }

    if (fileAsset.fileType !== (mediaType === MediaType.IMAGE ? FileType.IMAGE : FileType.VIDEO)) {
      throw new BadRequestException('Media type does not match file type');
    }
  }
}
