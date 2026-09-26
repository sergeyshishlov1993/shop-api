import {
  Body,
  Controller,
  Headers,
  Ip,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Public, SwaggerJwtAuth } from '../common/decorators';
import { AuthService } from './auth.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';

@ApiTags('Auth — Аутентификация')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({
    summary: 'Регистрация нового пользователя',
    description: `**Доступ:** публичный

**Бизнес-логика:**
1. Проверяется уникальность email — если занят, ошибка 400
2. Пароль хешируется через bcrypt (10 раундов)
3. Создаётся User с ролью \`USER\`
4. Генерируется JWT access token (15 мин)
5. Генерируется refresh token (UUID), хешируется, сохраняется в RefreshSession с привязкой к userAgent/IP
6. Refresh token записывается в httpOnly cookie

**Мерж корзины:**
Если в cookie есть \`cartSessionId\` (гостевая корзина) — после регистрации она привязывается к новому аккаунту. При пересечении товаров берётся максимальное количество.

**Ответ:** \`{ accessToken }\` + cookie \`refreshToken\` (path: /api/auth, maxAge: 30 дней)`,
  })
  @ApiResponse({
    status: 201,
    description: 'Пользователь создан. Access token в теле, refresh token в cookie.',
  })
  @ApiResponse({
    status: 400,
    description: 'Ошибка валидации (невалидный email, короткий пароль) или email уже занят.',
  })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent: string,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = req.cookies?.cartSessionId as string | undefined;

    const tokens = await this.authService.register(
      dto,
      userAgent,
      ip,
      sessionId ?? null,
    );

    this.setRefreshTokenCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @UseGuards(ThrottlerGuard, LocalAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('login')
  @ApiBody({ type: LoginDto })
  @ApiOperation({
    summary: 'Вход в аккаунт',
    description: `**Доступ:** публичный · **Rate limit:** 5 попыток/мин на IP

**Бизнес-логика:**
1. Поиск пользователя по email
2. Проверка \`isActive\` — если деактивирован админом → 403
3. Сравнение пароля с хешем (bcrypt) — неверный → 401 (без уточнения что именно неверно — защита от перебора)
4. Генерация пары токенов, создание RefreshSession

**Мерж корзины:** если есть \`cartSessionId\` в cookie — гостевая корзина мержится с корзиной аккаунта

**Защита от брутфорса:** при превышении 5 попыток/мин с одного IP → 429. Счётчик сбрасывается через 60 сек.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Успешный вход. Access token в теле, refresh token в cookie.',
  })
  @ApiResponse({
    status: 401,
    description: 'Неверный email или пароль.',
  })
  @ApiResponse({
    status: 403,
    description: 'Аккаунт деактивирован администратором.',
  })
  @ApiResponse({
    status: 429,
    description: 'Превышен лимит попыток входа (5/мин на IP).',
  })
  async login(
    @Req() req: Request & { user: { id: number } },
    @Headers('user-agent') userAgent: string,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sessionId = req.cookies?.cartSessionId as string | undefined;

    const tokens = await this.authService.login(
      req.user.id,
      userAgent,
      ip,
      sessionId ?? null,
    );

    this.setRefreshTokenCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @Public()
  @ApiCookieAuth('refreshToken')
  @Post('refresh')
  @ApiOperation({
    summary: 'Обновление access token',
    description: `**Доступ:** требует cookie \`refreshToken\`

**Зачем:** access token живёт 15 мин. Когда истекает, фронтенд вызывает этот метод для получения нового без повторного ввода пароля.

**Бизнес-логика:**
1. Читается refresh token из httpOnly cookie
2. Хеш токена ищется в RefreshSession
3. Проверяется: не отозвана (\`revokedAt IS NULL\`), не просрочена (\`expiresAt > now\`)
4. Старая сессия отзывается (\`revokedAt = now\`)
5. Создаётся новая пара access + refresh token
6. Новая RefreshSession сохраняется

**Ротация токенов:** каждый refresh token одноразовый. После использования инвалидируется. Если злоумышленник перехватит старый токен — сессия уже отозвана, запрос вернёт 401.`,
  })
  @ApiResponse({
    status: 200,
    description: 'Новая пара токенов выдана.',
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token отсутствует, недействителен, просрочен или сессия отозвана.',
  })
  async refresh(
    @Req() req: Request,
    @Headers('user-agent') userAgent: string,
    @Ip() ip: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refreshToken as string | undefined;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token not provided');
    }

    const tokens = await this.authService.refresh(refreshToken, userAgent, ip);
    this.setRefreshTokenCookie(res, tokens.refreshToken);
    return { accessToken: tokens.accessToken };
  }

  @SwaggerJwtAuth()
  @ApiCookieAuth('refreshToken')
  @Post('logout')
  @ApiOperation({
    summary: 'Выход из аккаунта',
    description: `**Доступ:** авторизованный пользователь (JWT)

**Бизнес-логика:**
1. Читается refresh token из cookie
2. RefreshSession помечается как отозванная (\`revokedAt = now\`)
3. Cookie \`refreshToken\` очищается

**Важно:** отзывается только текущая сессия. Остальные устройства продолжают работать. Для принудительного выхода со всех устройств — смена пароля (PATCH /storefront/account/password).`,
  })
  @ApiResponse({
    status: 201,
    description: 'Сессия отозвана, cookie очищена.',
  })
  @ApiResponse({
    status: 401,
    description: 'Access token отсутствует или недействителен.',
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.refreshToken as string | undefined;

    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }

    res.clearCookie('refreshToken', { path: '/api/auth' });
    return { message: 'Logged out' };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 3600000, limit: 3 } })
  @Post('forgot-password')
  @ApiOperation({
    summary: 'Запрос на восстановление пароля',
    description: `**Доступ:** публичный · **Rate limit:** 3 запроса/час на IP

**Бизнес-логика:**
1. Поиск пользователя по email
2. **Если не найден** — всё равно возвращается 201 (не раскрываем существование email)
3. Если найден — генерируется UUID токен, хешируется, сохраняется PasswordResetToken с TTL 1 час
4. Отправляется email через Resend: \`{FRONTEND_URL}/reset-password?token={token}\`

**Безопасность:**
- Ответ всегда одинаковый (201) — защита от перечисления аккаунтов
- Rate limit 3/час на IP — защита от спама
- Токен одноразовый, живёт 1 час`,
  })
  @ApiResponse({
    status: 201,
    description: 'Если email существует, ссылка отправлена. Ответ всегда одинаковый.',
  })
  @ApiResponse({
    status: 429,
    description: 'Превышен лимит запросов (3/час на IP).',
  })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto.email);
    return { message: 'If the email exists, a reset link has been sent' };
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({
    summary: 'Сброс пароля по токену',
    description: `**Доступ:** публичный

**Зачем:** пользователь перешёл по ссылке из email и вводит новый пароль.

**Бизнес-логика:**
1. Токен хешируется, ищется PasswordResetToken по хешу
2. Проверяется: не использован (\`usedAt IS NULL\`), не просрочен (\`expiresAt > now\`)
3. Новый пароль хешируется (bcrypt)
4. Обновляется \`passwordHash\` пользователя
5. Токен помечается как использованный (\`usedAt = now\`)
6. **Все RefreshSession пользователя отзываются** — принудительный выход со всех устройств

**Почему отзываются все сессии:** если пароль сбрасывается из-за компрометации, все активные сессии (возможно злоумышленника) закрываются. Пользователь входит заново с новым паролем.`,
  })
  @ApiResponse({
    status: 201,
    description: 'Пароль обновлён, все активные сессии отозваны.',
  })
  @ApiResponse({
    status: 400,
    description: 'Токен недействителен, просрочен или уже использован.',
  })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto.token, dto.newPassword);
    return { message: 'Password has been reset' };
  }

  private setRefreshTokenCookie(res: Response, refreshToken: string) {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
}
