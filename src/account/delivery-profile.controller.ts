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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, SwaggerJwtAuth } from '../common/decorators';
import { CreateDeliveryProfileDto } from './dto/create-delivery-profile.dto';
import { UpdateDeliveryProfileDto } from './dto/update-delivery-profile.dto';
import { DeliveryProfileService } from './delivery-profile.service';

@ApiTags('Account — Личный кабинет')
@Controller('storefront/account/delivery-profiles')
@UseGuards(JwtAuthGuard)
@SwaggerJwtAuth()
export class DeliveryProfileController {
  constructor(private readonly deliveryProfileService: DeliveryProfileService) {}

  @Get()
  @ApiOperation({
    summary: 'Список адресов доставки',
    description: `**Доступ:** авторизованный пользователь (JWT)

**Зачем:** сохранённые адреса доставки. При оформлении заказа можно выбрать адрес одним кликом вместо повторного заполнения.

**Ответ:** массив профилей, у одного \`isDefault: true\` (выбранный по умолчанию).`,
  })
  @ApiResponse({
    status: 200,
    description: 'Список профилей доставки успешно получен.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  async findAll(@CurrentUser('id') userId: number) {
    return this.deliveryProfileService.findAll(userId);
  }

  @Post()
  @ApiOperation({
    summary: 'Создать адрес доставки',
    description: `**Доступ:** авторизованный пользователь (JWT)

**Зачем:** сохранить новый адрес для быстрого оформления заказов.

**Поля:**
- \`title\` — название для удобства («Дом», «Офис»)
- \`recipientFirstName/LastName/Phone\` — данные получателя (может отличаться от владельца аккаунта)
- \`deliveryProvider\` — служба доставки (Нова Пошта, Укрпошта и т.д.)
- \`city\` — город
- \`warehouse\` — отделение (для отделений)
- \`addressLine\` — адрес (для курьерской)
- \`isDefault\` — сделать основным

**Бизнес-логика:** если \`isDefault: true\` — у всех остальных профилей пользователя \`isDefault\` сбрасывается (только один профиль по умолчанию).`,
  })
  @ApiResponse({
    status: 201,
    description: 'Профиль доставки создан.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации входных данных.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  async create(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateDeliveryProfileDto,
  ) {
    return this.deliveryProfileService.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Обновить адрес доставки',
    description: `**Доступ:** авторизованный пользователь (JWT)

**Бизнес-логика:** проверяется принадлежность профиля текущему пользователю. Если передан \`isDefault: true\` — остальные профили сбрасываются.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор профиля доставки',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Профиль доставки обновлён.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации или некорректный id.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 404,
    description: 'Профиль не найден или принадлежит другому пользователю.',
  })
  async update(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) profileId: number,
    @Body() dto: UpdateDeliveryProfileDto,
  ) {
    return this.deliveryProfileService.update(userId, profileId, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Удалить адрес доставки',
    description: `**Доступ:** авторизованный пользователь (JWT)

**Бизнес-логика:** физическое удаление (не soft delete — это пользовательские данные, не контент магазина). Проверяется принадлежность профиля текущему пользователю.`,
  })
  @ApiParam({
    name: 'id',
    description: 'Идентификатор профиля доставки',
    example: 1,
  })
  @ApiResponse({
    status: 200,
    description: 'Профиль доставки удалён.',
  })
  @ApiResponse({
    status: 400,
    description: 'Некорректный id.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 404,
    description: 'Профиль не найден или принадлежит другому пользователю.',
  })
  async remove(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) profileId: number,
  ) {
    return this.deliveryProfileService.remove(userId, profileId);
  }
}
