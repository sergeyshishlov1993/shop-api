import { IsBoolean, IsEmail, IsInt, IsObject, IsOptional, IsString, Min, MinLength, Max } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  storePhone?: string;

  @IsOptional()
  @IsEmail()
  storeEmail?: string;

  @IsOptional()
  @IsString()
  storeAddress?: string;

  @IsOptional()
  @IsObject()
  socialLinksJson?: Record<string, string>;

  @IsOptional()
  @IsInt()
  @Min(0)
  defaultLowStockThreshold?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  telegramAdminChatId?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  novaPoshtaApiKey?: string;

  @IsOptional()
  @IsString()
  npSenderRef?: string;

  @IsOptional()
  @IsString()
  npSenderContactRef?: string;

  @IsOptional()
  @IsString()
  npSenderCityRef?: string;

  @IsOptional()
  @IsString()
  npSenderWarehouseRef?: string;

  @IsOptional()
  @IsString()
  npSenderPhone?: string;

  @IsOptional()
  @IsObject()
  seoDefaultsJson?: Record<string, string>;

  @IsOptional()
  @IsObject()
  themeJson?: Record<string, string>;

  // Мягкий тумблер онлайн-оплаты (0.1). Работает только если PAYMENTS_ENABLED=true.
  @IsOptional()
  @IsBoolean()
  onlinePaymentEnabled?: boolean;

  // Повернення: вимкнути блок повністю та строк на повернення (днів після доставки)
  @IsOptional()
  @IsBoolean()
  returnsEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  returnWindowDays?: number;
}
