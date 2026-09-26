import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Roles, SwaggerJwtAuth } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateSizeDto } from './dto/create-size.dto';
import { UpdateSizeDto } from './dto/update-size.dto';
import { SizeService } from './size.service';

@ApiTags('Admin — Розміри')
@Controller('admin/sizes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class SizeController {
  constructor(private readonly sizeService: SizeService) {}

  @Get()
  @ApiOperation({
    summary: 'Список розмірів',
    description: `**Доступ:** ADMIN

**Зачем:** управління довідником розмірів. Розміри прив'язуються до варіантів товарів.

**Фільтри:**
- \`sizeType\` — CLOTHING (XS, S, M, L, XL, XXL), SHOES (36–46), UNIVERSAL (one size)

**Ответ:** масив розмірів з id, name, sizeType, sortOrder.

**Зв'язок з товарами:** при створенні варіанту (ProductVariant) вказується \`sizeId\`. Тип розміру (\`sizeType\`) повинен відповідати \`productType\` товару:
- CLOTHING → sizeType: CLOTHING
- SHOES → sizeType: SHOES
- ACCESSORY → sizeType: UNIVERSAL (або без розміру)`,
  })
  @ApiResponse({
    status: 200,
    description: 'Список розмірів.',
  })
  @ApiResponse({
    status: 401,
    description: 'Потрібна авторизація.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ тільки для ADMIN.',
  })
  findAll(@Query('sizeType') sizeType?: string) {
    return this.sizeService.findAll(sizeType as any);
  }

  @Post()
  @ApiOperation({
    summary: 'Створити розмір',
    description: `**Доступ:** ADMIN

**Поля:**
- \`name\` — назва розміру (S, M, L, 42, One Size)
- \`sizeType\` — CLOTHING, SHOES або UNIVERSAL
- \`sortOrder\` — порядок відображення у фільтрах та на картці товару`,
  })
  @ApiResponse({
    status: 201,
    description: 'Розмір створено.',
  })
  @ApiResponse({
    status: 400,
    description: 'Помилка валідації або дублікат.',
  })
  @ApiResponse({
    status: 401,
    description: 'Потрібна авторизація.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ тільки для ADMIN.',
  })
  create(@Body() dto: CreateSizeDto) {
    return this.sizeService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Оновити розмір',
    description: `**Доступ:** ADMIN

**Бізнес-логіка:** часткове оновлення — name, sortOrder. Зміна sizeType заборонена якщо розмір вже використовується у варіантах.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Ідентифікатор розміру',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Розмір оновлено.',
  })
  @ApiResponse({
    status: 400,
    description: 'Помилка валідації.',
  })
  @ApiResponse({
    status: 401,
    description: 'Потрібна авторизація.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ тільки для ADMIN.',
  })
  @ApiResponse({
    status: 404,
    description: 'Розмір не знайдено.',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSizeDto,
  ) {
    return this.sizeService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Видалити розмір',
    description: `**Доступ:** ADMIN

**Бізнес-логіка:** фізичне видалення. Якщо розмір використовується у варіантах товарів — помилка 400 з кількістю пов'язаних варіантів.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Ідентифікатор розміру',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Розмір видалено.',
  })
  @ApiResponse({
    status: 400,
    description: 'Розмір використовується у варіантах.',
  })
  @ApiResponse({
    status: 401,
    description: 'Потрібна авторизація.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ тільки для ADMIN.',
  })
  @ApiResponse({
    status: 404,
    description: 'Розмір не знайдено.',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.sizeService.remove(id);
  }
}
