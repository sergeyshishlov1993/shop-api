import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SizeType } from '@prisma/client';
import { CreateSizeDto, UpdateSizeDto } from './dto';

@Injectable()
export class SizeService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(sizeType?: SizeType, isActive?: boolean) {
    return this.prisma.size.findMany({
      where: {
        ...(sizeType !== undefined && { sizeType }),
        ...(isActive !== undefined && { isActive }),
      },
      orderBy: [{ sizeType: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async create(dto: CreateSizeDto) {
    return this.prisma.size.create({ data: dto });
  }

  async update(id: number, dto: UpdateSizeDto) {
    await this.findByIdOrThrow(id);
    return this.prisma.size.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.findByIdOrThrow(id);

    const variantsCount = await this.prisma.productVariant.count({
      where: { sizeId: id },
    });

    if (variantsCount > 0) {
      throw new ConflictException(
        `Size is used in ${variantsCount} product variant(s) and cannot be deleted`,
      );
    }

    return this.prisma.size.delete({ where: { id } });
  }

  private async findByIdOrThrow(id: number) {
    const size = await this.prisma.size.findUnique({ where: { id } });
    if (!size) {
      throw new NotFoundException(`Size with id ${id} not found`);
    }
    return size;
  }
}
