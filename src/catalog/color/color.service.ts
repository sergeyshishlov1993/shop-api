import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateColorDto, UpdateColorDto } from './dto';

@Injectable()
export class ColorService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(isActive?: boolean) {
    return this.prisma.color.findMany({
      where: {
        ...(isActive !== undefined && { isActive }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateColorDto) {
    return this.prisma.color.create({ data: dto });
  }

  async update(id: number, dto: UpdateColorDto) {
    await this.findByIdOrThrow(id);
    return this.prisma.color.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findByIdOrThrow(id);

    const variantsCount = await this.prisma.productVariant.count({
      where: { colorId: id },
    });

    if (variantsCount > 0) {
      throw new ConflictException(
        `Color is used in ${variantsCount} product variant(s) and cannot be deleted`,
      );
    }

    return this.prisma.color.delete({ where: { id } });
  }

  private async findByIdOrThrow(id: number) {
    const color = await this.prisma.color.findUnique({ where: { id } });
    if (!color) {
      throw new NotFoundException(`Color with id ${id} not found`);
    }
    return color;
  }
}
