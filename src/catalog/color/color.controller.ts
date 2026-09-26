import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
import { CreateColorDto } from './dto/create-color.dto';
import { UpdateColorDto } from './dto/update-color.dto';
import { ColorService } from './color.service';

@ApiTags('Admin — Кольори')
@Controller('admin/colors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@SwaggerJwtAuth()
export class ColorController {
  constructor(private readonly colorService: ColorService) {}

  @Get()
  @ApiOperation({
    summary: 'Список кольорів',
    description: `**Доступ:** ADMIN

**Зачем:** управління довідником кольорів. Кольори прив'язуються до варіантів товарів.

**Ответ:** масив кольорів з id, name, hexCode, sortOrder.

**На вітрині:** hexCode використовується для відображення кружечка кольору у фільтрах та на картці товару.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Список кольорів.',
  })
  @ApiResponse({
    status: 401,
    description: 'Потрібна авторизація.',
  })
  @ApiResponse({
    status: 403,
    description: 'Доступ тільки для ADMIN.',
  })
  findAll() {
    return this.colorService.findAll();
  }

  @Post()
  @ApiOperation({
    summary: 'Створити колір',
    description: `**Доступ:** ADMIN

**Поля:**
- \`name\` — назва кольору (Чорний, Білий, Синій)
- \`hexCode\` — HEX-код (#000000, #FFFFFF, #0000FF) для відображення на вітрині
- \`sortOrder\` — порядок у фільтрах`,
  })
  @ApiResponse({
    status: 201,
    description: 'Колір створено.',
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
  create(@Body() dto: CreateColorDto) {
    return this.colorService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Оновити колір',
    description: `**Доступ:** ADMIN

**Бізнес-логіка:** часткове оновлення — name, hexCode, sortOrder.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Ідентифікатор кольору',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Колір оновлено.',
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
    description: 'Колір не знайдено.',
  })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateColorDto,
  ) {
    return this.colorService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Видалити колір',
    description: `**Доступ:** ADMIN

**Бізнес-логіка:** фізичне видалення. Якщо колір використовується у варіантах товарів — помилка 400 з кількістю пов'язаних варіантів.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Ідентифікатор кольору',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Колір видалено.',
  })
  @ApiResponse({
    status: 400,
    description: 'Колір використовується у варіантах.',
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
    description: 'Колір не знайдено.',
  })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.colorService.remove(id);
  }
}
