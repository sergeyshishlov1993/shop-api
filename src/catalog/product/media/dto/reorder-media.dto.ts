import { IsArray, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

class ReorderItem {
  @IsInt()
  id!: number;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderMediaDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderItem)
  items!: ReorderItem[];
}
