import { IsString, IsNotEmpty, IsBoolean, IsOptional, Matches } from 'class-validator';

export class UpdateColorDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'hexCode must be a valid hex color (e.g. #FF0000)' })
  @IsOptional()
  hexCode?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
