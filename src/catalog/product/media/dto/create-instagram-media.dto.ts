import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export const INSTAGRAM_URL_RE =
  /^https?:\/\/(www\.)?instagram\.com\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?(\?.*)?$/;

export class CreateInstagramMediaDto {
  @IsString()
  @Matches(INSTAGRAM_URL_RE, { message: 'url must be an Instagram post/reel URL' })
  url!: string;

  @IsInt()
  @IsOptional()
  variantId?: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;
}
