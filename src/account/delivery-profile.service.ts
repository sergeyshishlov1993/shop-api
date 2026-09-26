import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateDeliveryProfileDto } from './dto/create-delivery-profile.dto';
import { UpdateDeliveryProfileDto } from './dto/update-delivery-profile.dto';

@Injectable()
export class DeliveryProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: number) {
    return this.prisma.userDeliveryProfile.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(userId: number, dto: CreateDeliveryProfileDto) {
    if (dto.isDefault) {
      await this.resetDefault(userId);
    }

    return this.prisma.userDeliveryProfile.create({
      data: { ...dto, userId },
    });
  }

  async update(userId: number, profileId: number, dto: UpdateDeliveryProfileDto) {
    await this.verifyOwnership(userId, profileId);

    if (dto.isDefault === true) {
      await this.resetDefault(userId);
    }

    return this.prisma.userDeliveryProfile.update({
      where: { id: profileId },
      data: dto,
    });
  }

  async remove(userId: number, profileId: number) {
    await this.verifyOwnership(userId, profileId);

    await this.prisma.userDeliveryProfile.delete({
      where: { id: profileId },
    });

    return { message: 'Delivery profile deleted' };
  }

  private async verifyOwnership(userId: number, profileId: number) {
    const profile = await this.prisma.userDeliveryProfile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      throw new NotFoundException('Delivery profile not found');
    }

    if (profile.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
  }

  private async resetDefault(userId: number) {
    await this.prisma.userDeliveryProfile.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });
  }
}
