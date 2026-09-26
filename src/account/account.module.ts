import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { FileModule } from '../file/file.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { DeliveryProfileController } from './delivery-profile.controller';
import { DeliveryProfileService } from './delivery-profile.service';

@Module({
  imports: [CartModule, FileModule],
  controllers: [AccountController, DeliveryProfileController],
  providers: [AccountService, DeliveryProfileService],
})
export class AccountModule {}
