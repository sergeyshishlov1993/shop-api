import {
    Injectable,
    NotFoundException,
    ConflictException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';

@Injectable()
export class CategoryService {
    constructor(private readonly prisma: PrismaService) {}

    async findAll(includeDeleted = false) {
        return this.prisma.category.findMany({
            where: {
                ...(!includeDeleted && { deletedAt: null }),
            },
            include: {
                imageFile: true,
                bannerFile: true,
                children: {
                    where: { deletedAt: null },
                    orderBy: { sortOrder: 'asc' },
                },
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });
    }

    async findAllStorefront() {
        const roots = await this.prisma.category.findMany({
            where: {
                deletedAt: null,
                isActive: true,
                parentId: null,
            },
            include: {
                imageFile: true,
                bannerFile: true,
                children: {
                    where: {
                        deletedAt: null,
                        isActive: true,
                    },
                    include: {
                        imageFile: true,
                        bannerFile: true,
                    },
                    orderBy: { sortOrder: 'asc' },
                },
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        });

        const counts = await this.countAvailableProductsByCategory();
        const ownCount = (id: number): number => counts.get(id) ?? 0;

        // Витрина не показывает категории без товаров в наличии. У родителя
        // считаем сумму с детьми — фильтр по родителю захватывает и их тоже.
        return roots
            .map((root) => {
                const children = root.children
                    .map((child) => ({ ...child, productCount: ownCount(child.id) }))
                    .filter((child) => child.productCount > 0);

                const productCount = children.reduce(
                    (total, child) => total + child.productCount,
                    ownCount(root.id),
                );

                return { ...root, children, productCount };
            })
            .filter((root) => root.productCount > 0);
    }

    /** Товар считается доступным по тем же правилам, что и в каталоге витрины. */
    private async countAvailableProductsByCategory(): Promise<Map<number, number>> {
        const rows = await this.prisma.$queryRaw<{ categoryId: number; count: number }[]>`
            SELECT p."categoryId" AS "categoryId", COUNT(DISTINCT p."id")::int AS "count"
            FROM "Product" p
            JOIN "ProductVariant" v ON v."productId" = p."id"
            WHERE p."isActive" = true
              AND p."deletedAt" IS NULL
              AND v."isActive" = true
              AND v."deletedAt" IS NULL
              AND (v."stockQty" - v."reservedQty") > 0
            GROUP BY p."categoryId"
        `;

        return new Map(rows.map((row) => [row.categoryId, Number(row.count)]));
    }

    async findById(id: number) {
        const category = await this.prisma.category.findFirst({
            where: { id, deletedAt: null },
            include: {
                imageFile: true,
                bannerFile: true,
                children: {
                    where: { deletedAt: null },
                    orderBy: { sortOrder: 'asc' },
                },
                parent: true,
            },
        });

        if (!category) {
            throw new NotFoundException(`Category with id ${id} not found`);
        }

        return category;
    }

    async create(dto: CreateCategoryDto) {
        await this.ensureSlugUnique(dto.slug);

        if (dto.parentId) {
            await this.findById(dto.parentId);
        }

        return this.prisma.category.create({
            data: dto,
            include: { imageFile: true, bannerFile: true },
        });
    }

    async update(id: number, dto: UpdateCategoryDto) {
        await this.findById(id);

        if (dto.slug) {
            await this.ensureSlugUnique(dto.slug, id);
        }

        if (dto.parentId !== undefined && dto.parentId !== null) {
            if (dto.parentId === id) {
                throw new BadRequestException('Category cannot be its own parent');
            }
            await this.findById(dto.parentId);
        }

        return this.prisma.category.update({
            where: { id },
            data: dto,
            include: { imageFile: true, bannerFile: true },
        });
    }

    async remove(id: number) {
        await this.findById(id);

        const childrenCount = await this.prisma.category.count({
            where: { parentId: id, deletedAt: null },
        });

        if (childrenCount > 0) {
            throw new ConflictException(
                `Category has ${childrenCount} child category(ies). Remove or reassign them first`,
            );
        }

        const productsCount = await this.prisma.product.count({
            where: { categoryId: id, deletedAt: null, isActive: true },
        });

        if (productsCount > 0) {
            throw new ConflictException(
                `Category has ${productsCount} active product(s). Remove or reassign them first`,
            );
        }

        return this.prisma.category.update({
            where: { id },
            data: { deletedAt: new Date() },
        });
    }

    private async ensureSlugUnique(slug: string, excludeId?: number) {
        const existing = await this.prisma.category.findFirst({
            where: {
                slug,
                deletedAt: null,
                ...(excludeId !== undefined && { id: { not: excludeId } }),
            },
        });

        if (existing) {
            throw new ConflictException(`Category with slug "${slug}" already exists`);
        }
    }
}