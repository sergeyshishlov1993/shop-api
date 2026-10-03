import { Throttle } from '@nestjs/throttler';
import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { NewsletterService } from './newsletter.service';
import { SubscribeNewsletterDto } from './dto/subscribe-newsletter.dto';

@ApiTags('Storefront — Розсилка')
@Controller('storefront/newsletter')
export class NewsletterController {
  constructor(private readonly newsletterService: NewsletterService) {}

  @Public()
  @Post('subscribe')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Підписка на розсилку (double opt-in)' })
  subscribe(@Body() dto: SubscribeNewsletterDto) {
    return this.newsletterService.subscribe(dto.email, dto.source);
  }

  @Public()
  @Get('confirm')
  @ApiOperation({ summary: 'Підтвердження підписки за токеном' })
  confirm(@Query('token') token: string) {
    return this.newsletterService.confirm(token);
  }

  @Public()
  @Get('unsubscribe')
  @ApiOperation({ summary: 'Відписка за токеном' })
  unsubscribe(@Query('token') token: string) {
    return this.newsletterService.unsubscribe(token);
  }
}
