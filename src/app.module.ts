import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccountModule } from './account/account.module';
import { AuthModule } from './auth/auth.module';
import { CacheModule } from './cache/cache.module';
import { CartModule } from './cart/cart.module';
import { CatalogModule } from './catalog/catalog.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { envValidationSchema } from './config/env.validation';
import { ContentModule } from './content/content.module';
import { CouponModule } from './coupon/coupon.module';
import { CronModule } from './cron/cron.module';
import { DeliveryModule } from './delivery/delivery.module';
import { EmailModule } from './email/email.module';
import { FavoriteModule } from './favorite/favorite.module';
import { FeedModule } from './feed/feed.module';
import { FeedbackModule } from './feedback/feedback.module';
import { FileModule } from './file/file.module';
import { FinanceModule } from './finance/finance.module';
import { HealthModule } from './health/health.module';
import { ImportModule } from './import/import.module';
import { InstagramModule } from './instagram/instagram.module';
import { LabelModule } from './label/label.module';
import { NewsletterModule } from './newsletter/newsletter.module';
import { NotificationModule } from './notification/notification.module';
import { OrderModule } from './order/order.module';
import { PaymentModule } from './payment/payment.module';
import { ReturnsModule } from './returns/returns.module';
import { ReviewModule } from './review/review.module';
import { S3Module } from './s3/s3.module';
import { SettingsModule } from './settings/settings.module';
import { StockNotificationModule } from './stock-notification/stock-notification.module';
import { UserModule } from './user/user.module';

@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            validationSchema: envValidationSchema,
        }),
        ThrottlerModule.forRoot([
            {
                ttl: 60000,
                limit: 100,
            },
        ]),
        ScheduleModule.forRoot(),
        CacheModule,
        PrismaModule,
        AuthModule,
        AccountModule,
        UserModule,
        S3Module,
        FileModule,
        EmailModule,
        CatalogModule,
        CartModule,
        FavoriteModule,
        OrderModule,
        PaymentModule,
        CouponModule,
        FeedModule,
        ReviewModule,
        ReturnsModule,
        ContentModule,
        FeedbackModule,
        FinanceModule,
        ImportModule,
        InstagramModule,
        LabelModule,
        NewsletterModule,
        NotificationModule,
        SettingsModule,
        StockNotificationModule,
        CronModule,
        HealthModule,
        DeliveryModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
    ],
})
export class AppModule {}