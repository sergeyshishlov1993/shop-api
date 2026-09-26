import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateReturnStatusDto {
  @ApiProperty({ enum: ReturnStatus })
  @IsEnum(ReturnStatus)
  status!: ReturnStatus;

  @ApiPropertyOptional({ description: 'Коментар до зміни статусу (бачить клієнт в історії)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ description: 'Сума повернення (обовʼязково для REFUNDED)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  refundAmount?: number;

  @ApiPropertyOptional({ description: 'Причина відмови (обовʼязково для REJECTED)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectReason?: string;

  @ApiPropertyOptional({ description: 'Внутрішній коментар менеджера' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  managerComment?: string;
}
