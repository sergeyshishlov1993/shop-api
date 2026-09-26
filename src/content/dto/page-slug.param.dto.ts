import { IsIn, IsString } from 'class-validator';

export class PageSlugParamDto {
  @IsString()
  @IsIn(['about', 'delivery'])
  slug!: 'about' | 'delivery';
}
