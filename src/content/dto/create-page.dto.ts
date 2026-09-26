import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { InputJsonValue } from '@prisma/client/runtime/library';

export class CreatePageDto {
  @IsString()
  @IsIn(['about', 'delivery'])
  slug!: 'about' | 'delivery';

  @IsString()
  title!: string;

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
