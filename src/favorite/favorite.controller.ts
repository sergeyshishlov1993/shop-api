import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SwaggerJwtAuth } from '../common/decorators';
import { FavoriteService } from './favorite.service';
import { CheckFavoritesQueryDto } from './dto/check-favorites-query.dto';
import { QueryFavoritesDto } from './dto/query-favorites.dto';

@ApiTags('Storefront — Избранное')
@Controller('storefront/favorites')
@UseGuards(JwtAuthGuard)
@SwaggerJwtAuth()
export class FavoriteController {
  constructor(private readonly favoriteService: FavoriteService) {}

  @Get()
  @ApiOperation({
    summary: 'Список избранных товаров',
    description: `**Доступ:** авторизованный пользователь (JWT)

**Зачем:** страница «Избранное» в личном кабинете или на витрине.

**Бизнес-логика:**
- Возвращаются только товары с доступными вариантами (active, not deleted, availableQty > 0)
- Товары без доступных вариантов автоматически исключаются из списка (но запись Favorite остаётся — товар вернётся когда появится в наличии)

**Ответ:** пагинированный список товаров с main media, effectivePrice, availabilityStatus.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Список избранного с пагинацией.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  findAll(
    @CurrentUser('id') userId: number,
    @Query() dto: QueryFavoritesDto,
  ) {
    return this.favoriteService.findAll(userId, dto);
  }

  @Get('check')
  @ApiOperation({
    summary: 'Проверить товары в избранном',
    description: `**Доступ:** авторизованный пользователь (JWT)

**Зачем:** при отображении каталога — показать иконку сердечка на товарах которые уже в избранном. Вызывается фронтендом при загрузке страницы каталога с массивом id видимых товаров.

**Query:** \`productIds=1,2,3,4,5\`
**Ответ:** \`{ 1: true, 3: true }\` — только id которые в избранном.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Словарь productId → true для товаров в избранном.',
  })
  @ApiResponse({
    status: 400,
    description: 'Некорректные productIds.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  check(
    @CurrentUser('id') userId: number,
    @Query() dto: CheckFavoritesQueryDto,
  ) {
    return this.favoriteService.check(userId, dto.productIds);
  }

  @Get('recommendations')
  @ApiOperation({
    summary: 'Рекомендации на основе избранного',
    description: `**Доступ:** авторизованный пользователь (JWT)

**Зачем:** персональные рекомендации — «Вам может понравиться» на основе категорий, типов и брендов товаров в избранном.

**Алгоритм:**
1. Собираются categoryId, productType, brand из товаров в избранном
2. Выбираются товары с совпадением по этим критериям, которых нет в избранном
3. Сортировка: больше совпадений → выше; при равенстве — isNew/isHit выше; затем random
4. Только active + not deleted + с доступными вариантами

**Ответ:** до 12 товаров в формате ProductCard.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Персональные рекомендации.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  recommendations(@CurrentUser('id') userId: number) {
    return this.favoriteService.getRecommendations(userId, 12);
  }

  @Post(':productId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Добавить в избранное',
    description: `**Доступ:** авторизованный пользователь (JWT)

**Бизнес-логика:**
- Проверяется что товар существует, активен и не удалён
- Создаётся запись Favorite (userId + productId, composite unique)
- Если уже в избранном — идемпотентно, ошибки не будет`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiResponse({
    status: 201,
    description: 'Товар добавлен в избранное.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  @ApiResponse({
    status: 404,
    description: 'Товар не найден, неактивен или удалён.',
  })
  add(
    @CurrentUser('id') userId: number,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.favoriteService.add(userId, productId);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Удалить из избранного',
    description: `**Доступ:** авторизованный пользователь (JWT)

**Бизнес-логика:** физическое удаление записи Favorite. Если товара нет в избранном — идемпотентно, 204.`,
  })
  @ApiParam({
    name: 'productId',
    description: 'Идентификатор товара',
    example: 1,
  })
  @ApiResponse({
    status: 204,
    description: 'Товар удалён из избранного.',
  })
  @ApiResponse({
    status: 401,
    description: 'Требуется авторизация.',
  })
  remove(
    @CurrentUser('id') userId: number,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.favoriteService.remove(userId, productId);
  }
}
