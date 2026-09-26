import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { SearchCitiesDto } from './dto/search-cities.dto';
import { SearchWarehousesDto } from './dto/search-warehouses.dto';

@ApiTags('Delivery')
@Controller('delivery')
export class DeliveryController {
    constructor(private readonly deliveryService: DeliveryService) {}

    @Get('cities')
    @ApiOperation({ summary: 'Search Nova Poshta cities' })
    searchCities(@Query() query: SearchCitiesDto) {
        return this.deliveryService.searchCities(query.search);
    }

    @Get('warehouses')
    @ApiOperation({ summary: 'Search Nova Poshta warehouses' })
    searchWarehouses(@Query() query: SearchWarehousesDto) {
        return this.deliveryService.searchWarehouses(query.city, query.search);
    }
}