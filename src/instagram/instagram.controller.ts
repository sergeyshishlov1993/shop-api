import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InstagramService } from './instagram.service';

@ApiTags('Storefront — Instagram')
@Controller('storefront/instagram')
export class InstagramController {
  constructor(private readonly instagramService: InstagramService) {}

  @Get()
  @ApiOperation({ summary: 'Активні пости Instagram-блоку' })
  list() {
    return this.instagramService.listStorefront();
  }
}
