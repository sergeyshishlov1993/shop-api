import { Injectable } from '@nestjs/common';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { PrismaService } from '../common/prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

type HealthDependencyStatus = 'up' | 'down';

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  db: HealthDependencyStatus;
  redis: HealthDependencyStatus;
  s3: HealthDependencyStatus;
}

@Injectable()
export class HealthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly s3Service: S3Service,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async check(): Promise<HealthCheckResponse> {
    const [db, redis, s3] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkS3(),
    ]);

    const status = db === 'up' && redis === 'up' && s3 === 'up' ? 'ok' : 'error';

    return {
      status,
      db,
      redis,
      s3,
    };
  }

  private async checkDatabase(): Promise<HealthDependencyStatus> {
    try {
      await this.prismaService.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkRedis(): Promise<HealthDependencyStatus> {
    try {
      await this.redis.ping();
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async checkS3(): Promise<HealthDependencyStatus> {
    try {
      const client = this.s3Service['client'] as {
        send(command: HeadBucketCommand): Promise<unknown>;
      };
      const bucket = this.s3Service['bucket'] as string;

      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return 'up';
    } catch {
      return 'down';
    }
  }
}
