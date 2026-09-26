import {
    Body,
    Controller,
    Delete,
    Get,
    Patch,
    Param,
    ParseIntPipe,
    Post,
    Query,
    Req,
    UploadedFile,
    UseGuards,
    UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
    ApiBody,
    ApiConsumes,
    ApiOperation,
    ApiResponse,
    ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, SwaggerJwtAuth } from '../common/decorators';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { GetAccountOrdersQueryDto } from './dto/get-account-orders-query.dto';
import { AccountService } from './account.service';

@ApiTags('Storefront — Особистий кабінет')
@Controller('storefront/account')
@UseGuards(JwtAuthGuard)
@SwaggerJwtAuth()
export class AccountController {
    constructor(private readonly accountService: AccountService) {}

    @Get('profile')
    @ApiOperation({
        summary: 'Профіль користувача',
        description: `**Доступ:** авторизований користувач (JWT)

**Зачем:** сторінка «Мій профіль» в особистому кабінеті.

**Ответ:** id, email, firstName, lastName, phone, avatarUrl, personalDiscountPercent, createdAt.`,
    })
    @ApiResponse({
        status: 200,
        description: 'Профіль отримано.',
    })
    @ApiResponse({
        status: 401,
        description: 'Потрібна авторизація.',
    })
    getProfile(@CurrentUser('id') userId: number) {
        return this.accountService.getProfile(userId);
    }

    @Patch('profile')
    @ApiOperation({
        summary: 'Оновити профіль',
        description: `**Доступ:** авторизований користувач (JWT)

**Редаговані поля:** firstName, lastName, phone. Email змінити не можна.`,
    })
    @ApiResponse({
        status: 200,
        description: 'Профіль оновлено.',
    })
    @ApiResponse({
        status: 400,
        description: 'Помилка валідації.',
    })
    @ApiResponse({
        status: 401,
        description: 'Потрібна авторизація.',
    })
    updateProfile(
        @CurrentUser('id') userId: number,
        @Body() dto: UpdateProfileDto,
    ) {
        return this.accountService.updateProfile(userId, dto);
    }

    @Post('avatar')
    @UseInterceptors(FileInterceptor('file'))
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Завантажити або замінити аватар користувача' })
    @ApiBody({
        schema: {
            type: 'object',
            properties: { file: { type: 'string', format: 'binary' } },
            required: ['file'],
        },
    })
    @ApiResponse({ status: 201, description: 'Аватар оновлено.' })
    uploadAvatar(
        @CurrentUser('id') userId: number,
        @UploadedFile() file: Express.Multer.File,
    ) {
        return this.accountService.updateAvatar(userId, file);
    }

    @Delete('avatar')
    @ApiOperation({ summary: 'Видалити аватар користувача' })
    @ApiResponse({ status: 200, description: 'Аватар видалено.' })
    deleteAvatar(@CurrentUser('id') userId: number) {
        return this.accountService.deleteAvatar(userId);
    }

    @Patch('password')
    @ApiOperation({
        summary: 'Змінити пароль',
        description: `**Доступ:** авторизований користувач (JWT)

**Бізнес-логіка:**
1. Перевіряється поточний пароль
2. Новий пароль хешується і зберігається
3. Всі RefreshSession крім поточної відкликаються — користувач залишається залогіненим на поточному пристрої, решта розлогінюються`,
    })
    @ApiResponse({
        status: 200,
        description: 'Пароль змінено, інші сесії відкликано.',
    })
    @ApiResponse({
        status: 400,
        description: 'Невірний поточний пароль або помилка валідації.',
    })
    @ApiResponse({
        status: 401,
        description: 'Потрібна авторизація.',
    })
    changePassword(
        @CurrentUser('id') userId: number,
        @Body() dto: ChangePasswordDto,
        @Req() request: Request,
    ) {
        const refreshToken = request.cookies?.['refreshToken'];
        return this.accountService.changePassword(
            userId,
            dto.currentPassword,
            dto.newPassword,
            refreshToken,
        );
    }

    @Get('orders')
    @ApiOperation({
        summary: 'Мої замовлення',
        description: `**Доступ:** авторизований користувач (JWT)

**Зачем:** сторінка «Мої замовлення» в особистому кабінеті.

**Фільтри:**
- \`status\` — фільтр по статусу замовлення

**Пагінація:** \`page\`, \`limit\`

**Ответ:** items[] з orderNumber, status, totalAmount, itemsCount, createdAt + totalCount. Тільки замовлення поточного користувача.`,
    })
    @ApiResponse({
        status: 200,
        description: 'Список замовлень користувача.',
    })
    @ApiResponse({
        status: 401,
        description: 'Потрібна авторизація.',
    })
    getOrders(
        @CurrentUser('id') userId: number,
        @Query() query: GetAccountOrdersQueryDto,
    ) {
        return this.accountService.getOrders(userId, query);
    }

    @Get('orders/:id')
    @ApiOperation({ summary: 'Деталі мого замовлення' })
    getOrderById(
        @CurrentUser('id') userId: number,
        @Param('id', ParseIntPipe) orderId: number,
    ) {
        return this.accountService.getOrderById(userId, orderId);
    }

    @Post('orders/:id/reorder')
    @ApiOperation({ summary: 'Повторити замовлення та додати доступні позиції в кошик' })
    reorder(
        @CurrentUser('id') userId: number,
        @Param('id', ParseIntPipe) orderId: number,
    ) {
        return this.accountService.reorder(userId, orderId);
    }

    @Get('delivery-profiles')
    @ApiOperation({
        summary: 'Адреси доставки',
        description: `**Доступ:** авторизований користувач (JWT)

**Зачем:** список збережених адресів доставки для швидкого оформлення замовлення.

**Ответ:** масив профілів доставки, один може мати \`isDefault: true\`.`,
    })
    @ApiResponse({
        status: 200,
        description: 'Список профілів доставки.',
    })
    @ApiResponse({
        status: 401,
        description: 'Потрібна авторизація.',
    })
    getDeliveryProfiles(@CurrentUser('id') userId: number) {
        return this.accountService.getDeliveryProfiles(userId);
    }
}
