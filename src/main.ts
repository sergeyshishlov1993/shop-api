import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { setupSwagger } from './config/swagger/swagger.config';
import { ErrorAlerter, ErrorAlertFilter } from './common/filters/error-alert.filter';
import { TelegramService } from './notification/telegram.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  const port = configService.get<number>('PORT', 3000);
  const prefix = configService.get<string>('API_PREFIX', 'api');
  const isProd = configService.get<string>('NODE_ENV') === 'production';

  // За nginx/Nuxt-прокси: реальный IP клиента для throttler и логов
  app.set('trust proxy', 1);
  // CSP только в проде — Swagger UI в dev не дружит с дефолтной политикой
  app.use(helmet({ contentSecurityPolicy: isProd, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  app.use(cookieParser());
  app.setGlobalPrefix(prefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const alerter = new ErrorAlerter(app.get(TelegramService));
  app.useGlobalFilters(new ErrorAlertFilter(alerter, app.get(HttpAdapterHost)));
  // Слушатель отменяет падение процесса по умолчанию — логируем и шлём алерт сами
  process.on('unhandledRejection', (reason) => {
    new Logger('Process').error('unhandledRejection', reason instanceof Error ? reason.stack : String(reason));
    alerter.alert('unhandledRejection', reason);
  });

  app.enableCors({
    origin: configService.get<string>('FRONTEND_URL'),
    credentials: true,
  });

  if (!isProd) setupSwagger(app, prefix);

  await app.listen(port);
}
bootstrap();
