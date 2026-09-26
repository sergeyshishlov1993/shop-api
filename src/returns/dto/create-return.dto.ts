import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnReason } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateReturnItemDto {
  @ApiProperty({ description: 'ID позиції замовлення' })
  @Type(() => Number)
  @IsInt()
  orderItemId!: number;

  @ApiProperty({ description: 'Кількість до повернення', minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateReturnDto {
  @ApiProperty({ description: 'ID замовлення' })
  @Type(() => Number)
  @IsInt()
  orderId!: number;

  @ApiProperty({ type: [CreateReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateReturnItemDto)
  items!: CreateReturnItemDto[];

  @ApiProperty({ enum: ReturnReason })
  @IsEnum(ReturnReason)
  reason!: ReturnReason;

  @ApiPropertyOptional({ description: 'Коментар клієнта' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiProperty({ description: 'Реквізити для повернення коштів (IBAN або картка)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  refundDetails!: string;

  @ApiPropertyOptional({ type: [Number], description: 'ID фото (до 3)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @Type(() => Number)
  @IsInt({ each: true })
  photoFileIds?: number[];
}
