import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { CartService } from '../cart/cart.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { GoogleProfile } from './types/google-profile.type';
import { Tokens } from './types/tokens.type';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly cartService: CartService,
  ) {}

  async register(
    dto: RegisterDto,
    userAgent?: string,
    ip?: string,
    sessionId?: string | null,
  ): Promise<Tokens> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash: await bcrypt.hash(dto.password, 10),
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
    });

    await this.cartService.mergeGuestCartToUser({
      userId: user.id,
      sessionId,
    });

    return this.generateTokensAndCreateSession(
      user.id,
      user.email,
      user.role,
      userAgent,
      ip,
    );
  }

  async validateLocalUser(
    email: string,
    password: string,
  ): Promise<{ id: number; email: string; role: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { id: user.id, email: user.email, role: user.role };
  }

  async login(
    userId: number,
    userAgent?: string,
    ip?: string,
    sessionId?: string | null,
  ): Promise<Tokens> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    await this.cartService.mergeGuestCartToUser({
      userId: user.id,
      sessionId,
    });

    return this.generateTokensAndCreateSession(
      user.id,
      user.email,
      user.role,
      userAgent,
      ip,
    );
  }

  async googleAuth(
    profile: GoogleProfile,
    userAgent?: string,
    ip?: string,
  ): Promise<Tokens> {
    const providerAccount = await this.prisma.userProviderAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: 'GOOGLE',
          providerUserId: profile.googleId,
        },
      },
      include: { user: true },
    });

    if (providerAccount) {
      if (!providerAccount.user.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }

      return this.generateTokensAndCreateSession(
        providerAccount.user.id,
        providerAccount.user.email,
        providerAccount.user.role,
        userAgent,
        ip,
      );
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (existingUser) {
      if (!existingUser.isActive) {
        throw new UnauthorizedException('Account is deactivated');
      }

      await this.prisma.userProviderAccount.create({
        data: {
          userId: existingUser.id,
          provider: 'GOOGLE',
          providerUserId: profile.googleId,
        },
      });

      return this.generateTokensAndCreateSession(
        existingUser.id,
        existingUser.email,
        existingUser.role,
        userAgent,
        ip,
      );
    }

    const newUser = await this.prisma.user.create({
      data: {
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        providerAccounts: {
          create: {
            provider: 'GOOGLE',
            providerUserId: profile.googleId,
          },
        },
      },
    });

    return this.generateTokensAndCreateSession(
      newUser.id,
      newUser.email,
      newUser.role,
      userAgent,
      ip,
    );
  }

  async refresh(
    refreshToken: string,
    userAgent?: string,
    ip?: string,
  ): Promise<Tokens> {
    const sessions = await this.prisma.refreshSession.findMany({
      where: { revokedAt: null },
      include: { user: true },
    });

    let matchedSession: (typeof sessions)[0] | null = null;

    for (const session of sessions) {
      if (session.expiresAt < new Date()) {
        continue;
      }
      if (await bcrypt.compare(refreshToken, session.tokenHash)) {
        matchedSession = session;
        break;
      }
    }

    if (!matchedSession) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!matchedSession.user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    await this.prisma.refreshSession.update({
      where: { id: matchedSession.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokensAndCreateSession(
      matchedSession.user.id,
      matchedSession.user.email,
      matchedSession.user.role,
      userAgent,
      ip,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    const sessions = await this.prisma.refreshSession.findMany({
      where: { revokedAt: null },
    });

    for (const session of sessions) {
      if (await bcrypt.compare(refreshToken, session.tokenHash)) {
        await this.prisma.refreshSession.update({
          where: { id: session.id },
          data: { revokedAt: new Date() },
        });
        return;
      }
    }
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return;
    }

    const recentTokensCount = await this.prisma.passwordResetToken.count({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });

    if (recentTokensCount >= 3) {
      return;
    }

    const rawToken = randomUUID();

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: await bcrypt.hash(rawToken, 10),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await this.emailService.sendPasswordResetEmail(user.email, rawToken);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokens = await this.prisma.passwordResetToken.findMany({
      where: {
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    let matchedToken: (typeof tokens)[0] | null = null;

    for (const token of tokens) {
      if (await bcrypt.compare(rawToken, token.tokenHash)) {
        matchedToken = token;
        break;
      }
    }

    if (!matchedToken) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: matchedToken.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: matchedToken.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshSession.updateMany({
        where: { userId: matchedToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  private async generateTokensAndCreateSession(
    userId: number,
    email: string,
    role: string,
    userAgent?: string,
    ip?: string,
  ): Promise<Tokens> {
    const signOptions: JwtSignOptions = {
      secret: this.configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.configService.get<string>(
        'JWT_ACCESS_EXPIRES_IN',
        '15m',
      ) as JwtSignOptions['expiresIn'],
    };

    const accessToken = this.jwtService.sign({ sub: userId, email, role }, signOptions);

    const refreshToken = randomUUID();

    await this.prisma.refreshSession.create({
      data: {
        userId,
        tokenHash: await bcrypt.hash(refreshToken, 10),
        userAgent: userAgent ?? null,
        ip: ip ?? null,
        expiresAt: this.calculateExpiry(
          this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '30d') ?? '30d',
        ),
      },
    });

    return { accessToken, refreshToken };
  }

  private calculateExpiry(duration: string): Date {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + parseInt(match[1], 10) * multipliers[match[2]]);
  }
}
