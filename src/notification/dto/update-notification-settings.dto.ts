import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateNotificationSettingsDto {
  @IsOptional()
  @IsString()
  telegramBotToken?: string;

  @IsOptional()
  @IsString()
  telegramChatId?: string;

  @IsOptional()
  @IsBoolean()
  notifyOnNewOrder?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnNewReview?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnNewFeedback?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnLowStock?: boolean;
}
