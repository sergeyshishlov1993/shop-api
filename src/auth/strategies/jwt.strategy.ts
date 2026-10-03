import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../types/jwt-payload.type';
import { RequestUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

type AuthState = { isActive: boolean; role: UserRole };

export const authUserCacheKey = (id: number) => `auth-user:${id}`;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  // Роль и isActive берём из БД (кэш 60с, сбрасывается при правке юзера админом),
  // чтобы деактивация/понижение роли действовали сразу, а не через 15 мин жизни токена.
  async validate(payload: JwtPayload): Promise<RequestUser> {
    const key = authUserCacheKey(payload.sub);
    let state = await this.cacheService.get<AuthState>(key);
    if (!state) {
      state = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { isActive: true, role: true },
      });
      if (state) await this.cacheService.set(key, state, 60);
    }
    if (!state?.isActive) throw new UnauthorizedException();

    return {
      id: payload.sub,
      email: payload.email,
      role: state.role,
    };
  }
}
