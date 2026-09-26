import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpsertSizeChartDto } from './dto/upsert-size-chart.dto';

@Injectable()
export class SizeChartService {
    constructor(private readonly prisma: PrismaService) {}

    async upsert(categoryId: number, dto: UpsertSizeChartDto) {
        await this.ensureCategoryExists(categoryId);

        return this.prisma.sizeChart.upsert({
            where: { categoryId },
            create: {
                categoryId,
                columns: dto.columns,
                rows: dto.rows,
            },
            update: {
                columns: dto.columns,
                rows: dto.rows,
            },
        });
    }

    async findByCategoryId(categoryId: number) {
        await this.ensureCategoryExists(categoryId);

        const sizeChart = await this.prisma.sizeChart.findUnique({
            where: { categoryId },
        });

        if (!sizeChart) {
            throw new NotFoundException(
                `Size chart for category ${categoryId} not found`,
            );
        }

        return sizeChart;
    }

    private async ensureCategoryExists(categoryId: number) {
        const category = await this.prisma.category.findFirst({
            where: { id: categoryId, deletedAt: null },
        });

        if (!category) {
            throw new NotFoundException(`Category with id ${categoryId} not found`);
        }
    }
}