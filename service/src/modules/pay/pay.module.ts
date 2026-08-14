import { Global, Module } from '@nestjs/common';
import { PayController } from './pay.controller';
import { PayService } from './pay.service';
import { OrderEntity } from '../order/order.entity';
import { CramiPackageEntity } from '../crami/cramiPackage.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PayPalModule } from './paypal/paypal.module';
import { StripeModule } from './stripe/stripe.module';
import { AlipayModule } from './alipay/alipay.module';
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity, CramiPackageEntity]),
    PayPalModule,
    StripeModule,
    AlipayModule,
  ],
  controllers: [PayController],
  providers: [PayService],
  exports: [PayService],
})
export class PayModule {}
