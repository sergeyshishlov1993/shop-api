import { Module } from '@nestjs/common';
import { FileModule } from '../file/file.module';
import { InstagramController } from './instagram.controller';
import { AdminInstagramController } from './admin-instagram.controller';
import { InstagramService } from './instagram.service';

@Module({
  imports: [FileModule],
  controllers: [InstagramController, AdminInstagramController],
  providers: [InstagramService],
})
export class InstagramModule {}
