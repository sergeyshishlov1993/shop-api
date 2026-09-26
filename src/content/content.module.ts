import { Module } from '@nestjs/common';
import { AdminHeroSlideController } from './admin-hero-slide.controller';
import { AdminPagesController } from './admin-pages.controller';
import { ContentService } from './content.service';
import { HeroSlideController } from './hero-slide.controller';
import { StorefrontPagesController } from './storefront-pages.controller';
import { PagesService } from './pages.service';
import { AdminPromoBlocksController } from './controllers/admin/promo-blocks.controller';
import { StorefrontPromoBlocksController } from './controllers/storefront/promo-blocks.controller';
import { AdminPromoBlocksService } from './services/promo-blocks/admin-promo-blocks.service';
import { StorefrontPromoBlocksService } from './services/promo-blocks/storefront-promo-blocks.service';

@Module({
  controllers: [
    AdminHeroSlideController,
    HeroSlideController,
    AdminPagesController,
    StorefrontPagesController,
    AdminPromoBlocksController,
    StorefrontPromoBlocksController,
  ],
  providers: [
    ContentService,
    PagesService,
    AdminPromoBlocksService,
    StorefrontPromoBlocksService,
  ],
  exports: [
    ContentService,
    PagesService,
    AdminPromoBlocksService,
    StorefrontPromoBlocksService,
  ],
})
export class ContentModule {}
