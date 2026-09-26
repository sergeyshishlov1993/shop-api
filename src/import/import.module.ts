import { Module } from '@nestjs/common';
import { FileModule } from '../file/file.module';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';

@Module({
  imports: [FileModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
