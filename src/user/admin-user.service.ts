import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { authUserCacheKey } from '../auth/strategies/jwt.strategy';
import { AdminGetUsersQueryDto } from './dto/admin-get-users-query.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@Injectable()
export class AdminUserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  async getUsers(query: AdminGetUsersQueryDto) {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(typeof query.isActive === 'boolean' ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { email: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { firstName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { lastName: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
              { phone: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            ],
          }
        : {}),
    };
    const [users, totalCount] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { orders: { select: { totalAmount: true } } },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map(({ passwordHash, orders, ...user }) => ({
        ...user,
        ordersCount: orders.length,
        totalSpent: orders.reduce((sum, order) => sum + order.totalAmount, 0),
      })),
      totalCount,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(totalCount / query.limit),
    };
  }

  async getUserById(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        avatarFile: true,
        deliveryProfiles: { orderBy: { createdAt: 'desc' } },
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, orderNumber: true, status: true, totalAmount: true, createdAt: true },
        },
        _count: { select: { orders: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const totals = await this.prisma.order.aggregate({
      where: { userId: id },
      _sum: { totalAmount: true },
      _avg: { totalAmount: true },
    });
    const { passwordHash, _count, ...result } = user;
    return {
      ...result,
      ordersCount: _count.orders,
      totalSpent: totals._sum.totalAmount ?? 0,
      averageOrderAmount: totals._avg.totalAmount ?? 0,
    };
  }

  async updateUser(id: number, dto: UpdateAdminUserDto, currentUserId: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (id === currentUserId && dto.role && dto.role !== UserRole.ADMIN) {
      throw new BadRequestException('You cannot remove your own administrator role');
    }
    const { passwordHash, ...result } = await this.prisma.user.update({ where: { id }, data: dto as Record<string, unknown> });
    await this.cacheService.del(authUserCacheKey(id));
    return result;
  }
}
