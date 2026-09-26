import { IsString, IsOptional, IsEmail, MinLength, MaxLength } from 'class-validator';

export class CreateFeedbackDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  message!: string;
}
