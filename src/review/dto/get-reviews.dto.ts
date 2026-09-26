import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const REVIEW_SORTS = ['newest', 'oldest', 'popular', 'rating_desc', 'rating_asc'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export const REVIEW_FILTERS = ['all', 'with_media', 'mine'] as const;
export type ReviewFilter = (typeof REVIEW_FILTERS)[number];

export class GetReviewsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @IsOptional()
  @IsIn(REVIEW_SORTS)
  sort?: ReviewSort = 'newest';

  @IsOptional()
  @IsIn(REVIEW_FILTERS)
  filter?: ReviewFilter = 'all';
}
