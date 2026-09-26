import { Module } from '@nestjs/common';
import { FileModule } from '../file/file.module';
import { S3Module } from '../s3/s3.module';
import { AdminReviewController } from './admin-review.controller';
import { ReviewActionsController, ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  imports: [S3Module, FileModule],
  controllers: [ReviewController, ReviewActionsController, AdminReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
