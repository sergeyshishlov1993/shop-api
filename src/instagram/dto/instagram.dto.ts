import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

const INSTAGRAM_LINK_REGEX = /^https:\/\/(www\.)?instagram\.com\/(p|reel)\/[A-Za-z0-9_-]+/;

export class CreateInstagramPostDto {
  @IsInt()
  fileId!: number;

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateInstagramPostFromLinkDto {
  @IsString()
  @Matches(INSTAGRAM_LINK_REGEX, { message: 'Некоректне посилання на Instagram.' })
  link!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateInstagramPostDto {
  @IsOptional()
  @IsInt()
  fileId?: number;

  @IsOptional()
  @IsString()
  link?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
