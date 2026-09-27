import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayUnique, IsArray, IsInt, Min } from 'class-validator';

export class SetWearWithDto {
  @ApiProperty({
    description: 'ID товарів «З чим носити» у потрібному порядку (порожній масив — очистити)',
    example: [12, 7],
    type: [Number],
  })
  @IsArray()
  @ArrayMaxSize(12)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  productIds!: number[];
}
