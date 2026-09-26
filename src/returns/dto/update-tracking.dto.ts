import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateReturnTrackingDto {
  @ApiProperty({ description: 'Номер ТТН зворотної посилки' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  trackingNumber!: string;
}
