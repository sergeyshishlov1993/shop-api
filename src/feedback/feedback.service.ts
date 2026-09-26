import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FeedbackStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { TelegramService } from '../notification/telegram.service';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { UpdateFeedbackStatusDto } from './dto/update-feedback-status.dto';

@Injectable()
export class FeedbackService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramService: TelegramService,
  ) {}

  async create(dto: CreateFeedbackDto, ip: string) {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentCount = await this.prisma.feedback.count({
      where: {
        ip,
        createdAt: { gte: oneHourAgo },
        deletedAt: null,
      },
    });

    if (recentCount >= 3) {
      throw new BadRequestException('Too many feedback requests. Try again later.');
    }

    const feedback = await this.prisma.feedback.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        message: dto.message,
        ip,
        status: FeedbackStatus.NEW,
      },
    });

    await this.telegramService.sendFeedbackNotification({
      name: feedback.name,
      phone: feedback.phone ?? undefined,
      email: feedback.email ?? undefined,
      message: feedback.message,
    });

    return feedback;
  }

  async findAll(status?: FeedbackStatus, page = 1, limit = 20) {
    const where: Record<string, unknown> = { deletedAt: null };

    if (status) {
      where.status = status;
    }

    const [items, totalCount] = await Promise.all([
      this.prisma.feedback.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.feedback.count({ where }),
    ]);

    return { items, totalCount, page, limit };
  }

  async updateStatus(id: number, dto: UpdateFeedbackStatusDto) {
    const feedback = await this.prisma.feedback.findFirst({
      where: { id, deletedAt: null },
    });

    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    return this.prisma.feedback.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  async softDelete(id: number) {
    const feedback = await this.prisma.feedback.findFirst({
      where: { id, deletedAt: null },
    });

    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    return this.prisma.feedback.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async restore(id: number) {
    const feedback = await this.prisma.feedback.findFirst({
      where: { id, deletedAt: { not: null } },
    });

    if (!feedback) {
      throw new NotFoundException('Deleted feedback not found');
    }

    return this.prisma.feedback.update({
      where: { id },
      data: { deletedAt: null },
    });
  }
}
