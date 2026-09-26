import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';
import { InputJsonValue } from '@prisma/client/runtime/library';

export class UpdatePageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsObject()
  contentJson?: InputJsonValue;

  @IsOptional()
  @IsString()
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
