import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdminReplyReviewDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;
}
