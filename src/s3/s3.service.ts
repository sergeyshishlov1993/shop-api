import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
  PutBucketPolicyCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface S3UploadOptions {
  key: string;
  body: Buffer;
  contentType: string;
}

@Injectable()
export class S3Service implements OnModuleInit {
  private readonly logger = new Logger(S3Service.name);
  private client: S3Client;
  private bucket: string;
  private endpoint: string;

  constructor(private readonly configService: ConfigService) {
    this.endpoint = this.configService.get<string>('S3_ENDPOINT')!;
    this.bucket = this.configService.get<string>('S3_BUCKET')!;

    this.client = new S3Client({
      endpoint: this.endpoint,
      region: this.configService.get<string>('S3_REGION')!,
      credentials: {
        accessKeyId: this.configService.get<string>('S3_ACCESS_KEY')!,
        secretAccessKey: this.configService.get<string>('S3_SECRET_KEY')!,
      },
      forcePathStyle: true,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucketExists();
      await this.ensurePublicRead();
    } catch (error) {
      this.logger.warn(`S3 bucket check failed — MinIO may be unavailable: ${error}`);
    }
  }

  async upload(options: S3UploadOptions): Promise<string> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: options.key,
      Body: options.body,
      ContentType: options.contentType,
    }));
    return this.getPublicUrl(options.key);
  }

  getPublicUrl(key: string): string {
    return `${this.endpoint}/${this.bucket}/${key}`;
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn });
  }

  buildKey(type: string, id: string, size: string, extension = 'webp'): string {
    return `${type}/${id}/${size}.${extension}`;
  }

  private async ensureBucketExists(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    }
  }

  private async ensurePublicRead(): Promise<void> {
    await this.client.send(new PutBucketPolicyCommand({
      Bucket: this.bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: '*', Action: ['s3:GetObject'], Resource: [`arn:aws:s3:::${this.bucket}/*`] }],
      }),
    }));
  }
}
