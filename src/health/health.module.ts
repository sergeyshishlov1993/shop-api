import { Module } from '@nestjs/common';
import { PrismaModule } from '../common/prisma/prisma.module';
import { CacheModule } from '../cache/cache.module';
import { S3Module } from '../s3/s3.module';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [PrismaModule, CacheModule, S3Module],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
