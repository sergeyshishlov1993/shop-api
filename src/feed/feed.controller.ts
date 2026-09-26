import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { FeedService } from './feed.service';

@ApiTags('Feeds — товарные фиды')
@Controller('feeds')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Public()
  @Get('google.xml')
  @Header('Content-Type', 'application/xml; charset=utf-8')
  @ApiOperation({ summary: 'Google Merchant feed (XML)' })
  google() {
    return this.feedService.googleXml();
  }

  @Public()
  @Get('facebook.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'Meta (Facebook/Instagram) catalog (CSV)' })
  facebook() {
    return this.feedService.facebookCsv();
  }
}
