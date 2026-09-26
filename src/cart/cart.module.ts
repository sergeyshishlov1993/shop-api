import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CartSessionMiddleware } from './cart-session.middleware';

@Module({
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CartSessionMiddleware)
      .forRoutes(
        {
          path: 'storefront/cart',
          method: RequestMethod.ALL,
        },
        {
          path: 'storefront/cart/(.*)',
          method: RequestMethod.ALL,
        },
      );
  }
}
