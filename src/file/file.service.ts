import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as sharp from 'sharp';
import * as ffmpeg from 'fluent-ffmpeg';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import { FileType } from '@prisma/client';

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime'];
const IMAGE_MAX_SIZE = 10 * 1024 * 1024;
const VIDEO_MAX_SIZE = 50 * 1024 * 1024;

const IMAGE_SIZES = [
  { name: 'thumb', width: 200 },
  { name: 'medium', width: 600 },
  { name: 'large', width: 1200 },
] as const;

export interface UploadedFileResult {
  id: number;
  url: string;
  fileType: string;
  previewId?: number;
  previewUrl?: string;
}

@Injectable()
export class FileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  async upload(file: Express.Multer.File): Promise<UploadedFileResult> {
    if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
      return this.processImage(file);
    }

    if (VIDEO_MIME_TYPES.includes(file.mimetype)) {
      return this.processVideo(file);
    }

    throw new BadRequestException('Unsupported file type. Allowed: jpeg, png, webp, mp4, mov');
  }

  async delete(fileId: number): Promise<void> {
    const fileAsset = await this.prisma.fileAsset.findUnique({ where: { id: fileId } });
    if (!fileAsset) throw new NotFoundException('File not found');

    const keysToDelete: string[] = [];

    if (fileAsset.fileType === FileType.IMAGE) {
      if (fileAsset.s3KeyThumb) keysToDelete.push(fileAsset.s3KeyThumb);
      if (fileAsset.s3KeyMedium) keysToDelete.push(fileAsset.s3KeyMedium);
      if (fileAsset.s3KeyLarge) keysToDelete.push(fileAsset.s3KeyLarge);
      keysToDelete.push(fileAsset.s3Key);
    }

    if (fileAsset.fileType === FileType.VIDEO) {
      keysToDelete.push(fileAsset.s3Key);

      if (fileAsset.previewFileId) {
        const previewAsset = await this.prisma.fileAsset.findUnique({
          where: { id: fileAsset.previewFileId },
        });

        if (previewAsset) {
          if (previewAsset.s3KeyThumb) keysToDelete.push(previewAsset.s3KeyThumb);
          if (previewAsset.s3KeyMedium) keysToDelete.push(previewAsset.s3KeyMedium);
          if (previewAsset.s3KeyLarge) keysToDelete.push(previewAsset.s3KeyLarge);
          keysToDelete.push(previewAsset.s3Key);
          await this.prisma.fileAsset.delete({ where: { id: previewAsset.id } });
        }
      }
    }

    for (const key of keysToDelete) {
      await this.s3Service.delete(key);
    }

    await this.prisma.fileAsset.delete({ where: { id: fileId } });
  }

  private async processImage(file: Express.Multer.File): Promise<UploadedFileResult> {
    if (file.size > IMAGE_MAX_SIZE) {
      throw new BadRequestException('Image size exceeds 10MB limit');
    }

    const assetId = randomUUID();
    const keys: Record<string, string> = {};
    const urls: Record<string, string> = {};

    for (const size of IMAGE_SIZES) {
      const buffer = await sharp(file.buffer)
        .resize(size.width, undefined, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      const key = this.s3Service.buildKey('images', assetId, size.name);
      keys[size.name] = key;
      urls[size.name] = await this.s3Service.upload({ key, body: buffer, contentType: 'image/webp' });
    }

    const fileAsset = await this.prisma.fileAsset.create({
      data: {
        fileType: FileType.IMAGE,
        originalName: file.originalname,
        mimeType: 'image/webp',
        size: file.size,
        s3Key: keys.large,
        s3KeyThumb: keys.thumb,
        s3KeyMedium: keys.medium,
        s3KeyLarge: keys.large,
      },
    });

    return {
      id: fileAsset.id,
      url: urls.large,
      fileType: 'IMAGE',
    };
  }

  private async processVideo(file: Express.Multer.File): Promise<UploadedFileResult> {
    if (file.size > VIDEO_MAX_SIZE) {
      throw new BadRequestException('Video size exceeds 50MB limit');
    }

    const tempDir = path.join(os.tmpdir(), `upload-${randomUUID()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    const inputPath = path.join(tempDir, `input${this.getExtension(file.mimetype)}`);
    const outputPath = path.join(tempDir, 'output.mp4');
    const previewPath = path.join(tempDir, 'preview.webp');

    try {
      fs.writeFileSync(inputPath, file.buffer);

      await this.convertToMp4(inputPath, outputPath);
      await this.generatePreview(inputPath, previewPath);

      const previewBuffer = fs.readFileSync(previewPath);
      const previewUuid = randomUUID();
      const previewKeys: Record<string, string> = {};
      const previewUrls: Record<string, string> = {};

      for (const size of IMAGE_SIZES) {
        const buffer = await sharp(previewBuffer)
          .resize(size.width, undefined, { withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();

        const key = this.s3Service.buildKey('previews', previewUuid, size.name);
        previewKeys[size.name] = key;
        previewUrls[size.name] = await this.s3Service.upload({ key, body: buffer, contentType: 'image/webp' });
      }

      const previewAsset = await this.prisma.fileAsset.create({
        data: {
          fileType: FileType.IMAGE,
          originalName: `preview-${file.originalname}.webp`,
          mimeType: 'image/webp',
          size: previewBuffer.length,
          s3Key: previewKeys.large,
          s3KeyThumb: previewKeys.thumb,
          s3KeyMedium: previewKeys.medium,
          s3KeyLarge: previewKeys.large,
        },
      });

      const videoBuffer = fs.readFileSync(outputPath);
      const videoKey = this.s3Service.buildKey('videos', randomUUID(), 'original', 'mp4');
      const videoUrl = await this.s3Service.upload({
        key: videoKey,
        body: videoBuffer,
        contentType: 'video/mp4',
      });

      const videoAsset = await this.prisma.fileAsset.create({
        data: {
          fileType: FileType.VIDEO,
          originalName: file.originalname,
          mimeType: 'video/mp4',
          size: videoBuffer.length,
          s3Key: videoKey,
          previewFileId: previewAsset.id,
        },
      });

      return {
        id: videoAsset.id,
        url: videoUrl,
        fileType: 'VIDEO',
        previewId: previewAsset.id,
        previewUrl: previewUrls.large,
      };
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private convertToMp4(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .outputOptions(['-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart'])
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (error: Error) => reject(new BadRequestException(`Video conversion failed: ${error.message}`)))
        .run();
    });
  }

  private generatePreview(inputPath: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const pngPath = outputPath.replace('.webp', '.png');
      ffmpeg(inputPath)
        .screenshots({
          count: 1,
          timemarks: ['00:00:01'],
          filename: path.basename(pngPath),
          folder: path.dirname(pngPath),
        })
        .on('end', async () => {
          try {
            await sharp(pngPath).webp({ quality: 80 }).toFile(outputPath);
            fs.unlinkSync(pngPath);
            resolve();
          } catch {
            reject(new BadRequestException('Preview generation failed'));
          }
        })
        .on('error', (error: Error) => reject(new BadRequestException(`Preview generation failed: ${error.message}`)));
    });
  }

  private getExtension(mimeType: string): string {
    return mimeType === 'video/quicktime' ? '.mov' : '.mp4';
  }
}
