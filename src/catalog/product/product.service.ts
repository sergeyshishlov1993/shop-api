import {
    Injectable,
    NotFoundException,
    ConflictException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, ProductType, FileType } from '@prisma/client';
import { CacheService } from '../../cache/cache.service';
import { CreateProductDto, UpdateProductDto, QueryProductDto, SetWearWithDto } from './dto';

@Injectable()
export class ProductService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly cacheService: CacheService,
    ) {}

    async findAll(query: QueryProductDto) {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const where = this.buildWhereClause(query);
        const orderBy = this.buildOrderBy(query.sort, query.order);

        const [items, totalCount] = await Promise.all([
            this.prisma.product.findMany({
                where,
                orderBy,
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    category: { select: { id: true, name: true, slug: true } },
                    hoverVideoFile: {
                        select: {
                            id: true,
                            s3Key: true,
                            s3KeyThumb: true,
                            originalName: true,
                        },
                    },
                    _count: { select: { variants: true, media: true } },
                },
            }),
            this.prisma.product.count({ where }),
        ]);

        return {
            items,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit),
        };
    }

    async findById(id: number) {
        const product = await this.prisma.product.findFirst({
            where: { id, deletedAt: null },
            include: {
                category: { select: { id: true, name: true, slug: true } },
                hoverVideoFile: {
                    select: {
                        id: true,
                        s3Key: true,
                        s3KeyThumb: true,
                        s3KeyMedium: true,
                        s3KeyLarge: true,
                        fileType: true,
                        originalName: true,
                    },
                },
                variants: {
                    where: { deletedAt: null },
                    include: {
                        size: { select: { id: true, name: true, sizeType: true } },
                        color: { select: { id: true, name: true, hexCode: true } },
                    },
                    orderBy: { createdAt: 'asc' },
                },
                media: {
                    include: {
                        file: {
                            select: {
                                id: true,
                                s3Key: true,
                                s3KeyThumb: true,
                                s3KeyMedium: true,
                                s3KeyLarge: true,
                                fileType: true,
                                originalName: true,
                            },
                        },
                    },
                    orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }],
                },
            },
        });

        if (!product) {
            throw new NotFoundException(`Product with id ${id} not found`);
        }

        return product;
    }

    async create(dto: CreateProductDto) {
        await this.validateSlugUnique(dto.slug);
        await this.validateCategory(dto.categoryId, dto.productType);

        if (dto.hoverVideoFileId) {
            await this.validateHoverVideoFile(dto.hoverVideoFileId);
        }

        const product = await this.prisma.product.create({
            data: dto,
            include: {
                category: { select: { id: true, name: true, slug: true } },
                hoverVideoFile: {
                    select: {
                        id: true,
                        s3Key: true,
                        s3KeyThumb: true,
                        originalName: true,
                    },
                },
            },
        });

        await this.cacheService.invalidateProduct(product.slug);
        return product;
    }

    async update(id: number, dto: UpdateProductDto) {
        const existing = await this.findByIdOrThrow(id);

        if (dto.slug !== undefined) {
            await this.validateSlugUnique(dto.slug, id);
        }

        if (dto.categoryId !== undefined || dto.productType !== undefined) {
            await this.validateCategory(dto.categoryId ?? existing.categoryId, dto.productType ?? existing.productType);
        }

        if (dto.hoverVideoFileId !== undefined && dto.hoverVideoFileId !== null) {
            await this.validateHoverVideoFile(dto.hoverVideoFileId);
        }

        const product = await this.prisma.product.update({
            where: { id },
            data: dto,
            include: {
                category: { select: { id: true, name: true, slug: true } },
                hoverVideoFile: {
                    select: {
                        id: true,
                        s3Key: true,
                        s3KeyThumb: true,
                        originalName: true,
                    },
                },
            },
        });

        await this.cacheService.invalidateProduct(existing.slug);
        if (product.slug !== existing.slug) {
            await this.cacheService.invalidateProduct(product.slug);
        }

        return product;
    }

    async remove(id: number) {
        const existing = await this.findByIdOrThrow(id);

        const product = await this.prisma.product.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        await this.cacheService.invalidateProduct(existing.slug);
        return product;
    }

    private buildWhereClause(query: QueryProductDto): Prisma.ProductWhereInput {
        const where: Prisma.ProductWhereInput = {
            deletedAt: null,
        };

        if (query.categoryId) {
            where.categoryId = query.categoryId;
        }

        if (query.productType) {
            where.productType = query.productType as ProductType;
        }

        if (query.brand) {
            where.brand = { contains: query.brand, mode: 'insensitive' };
        }

        if (query.isActive !== undefined) {
            where.isActive = query.isActive === 'true';
        }

        if (query.isNew !== undefined) {
            where.isNew = query.isNew === 'true';
        }

        if (query.isHit !== undefined) {
            where.isHit = query.isHit === 'true';
        }

        if (query.isSeasonal !== undefined) {
            where.isSeasonal = query.isSeasonal === 'true';
        }

        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { slug: { contains: query.search, mode: 'insensitive' } },
                {
                    variants: {
                        some: {
                            sku: { contains: query.search, mode: 'insensitive' },
                            deletedAt: null,
                        },
                    },
                },
            ];
        }

        return where;
    }

    private buildOrderBy(
        sort?: string,
        order?: 'asc' | 'desc',
    ): Prisma.ProductOrderByWithRelationInput {
        const direction = order ?? 'desc';
        switch (sort) {
            case 'name':
                return { name: direction };
            case 'basePrice':
                return { basePrice: direction };
            case 'createdAt':
            default:
                return { createdAt: direction };
        }
    }

    private async findByIdOrThrow(id: number) {
        const product = await this.prisma.product.findFirst({
            where: { id, deletedAt: null },
        });

        if (!product) {
            throw new NotFoundException(`Product with id ${id} not found`);
        }

        return product;
    }

    private async validateSlugUnique(slug: string, excludeId?: number) {
        const existing = await this.prisma.product.findFirst({
            where: {
                slug,
                deletedAt: null,
                ...(excludeId !== undefined && { id: { not: excludeId } }),
            },
        });

        if (existing) {
            throw new ConflictException(`Product with slug "${slug}" already exists`);
        }
    }

    private async validateCategory(categoryId: number, productType: ProductType) {
        const category = await this.prisma.category.findFirst({
            where: { id: categoryId, deletedAt: null },
        });

        if (!category) {
            throw new BadRequestException(
                `Category with id ${categoryId} not found`,
            );
        }

        if (category.productType && category.productType !== productType) {
            throw new BadRequestException(
                `Category productType "${category.productType}" does not match product productType "${productType}"`,
            );
        }
    }

    private async validateHoverVideoFile(fileId: number) {
        const file = await this.prisma.fileAsset.findUnique({
            where: { id: fileId },
        });

        if (!file) {
            throw new BadRequestException(`FileAsset with id ${fileId} not found`);
        }

        if (file.fileType !== FileType.VIDEO) {
            throw new BadRequestException(
                `FileAsset with id ${fileId} is not a video`,
            );
        }
    }

    async getWearWith(id: number) {
        await this.ensureProduct(id);
        const rows = await this.prisma.productWearWith.findMany({
            where: { productId: id },
            orderBy: { sortOrder: 'asc' },
            select: {
                relatedProduct: {
                    select: {
                        id: true, name: true, slug: true, basePrice: true, deletedAt: true,
                        media: {
                            where: { isMain: true },
                            take: 1,
                            select: { file: { select: { id: true, s3Key: true, s3KeyThumb: true } } },
                        },
                    },
                },
            },
        });
        return rows
            .map((r) => r.relatedProduct)
            .filter((p) => !p.deletedAt)
            .map((p) => ({
                id: p.id,
                name: p.name,
                slug: p.slug,
                price: p.basePrice,
                mainImage: p.media[0]?.file ?? null,
            }));
    }

    async setWearWith(id: number, dto: SetWearWithDto) {
        await this.ensureProduct(id);
        const ids = dto.productIds;
        if (ids.includes(id)) throw new BadRequestException('Product cannot be linked to itself');
        if (new Set(ids).size !== ids.length) throw new BadRequestException('Duplicate product ids');
        if (ids.length > 12) throw new BadRequestException('Maximum 12 products');
        if (ids.length > 0) {
            const found = await this.prisma.product.findMany({
                where: { id: { in: ids }, deletedAt: null },
                select: { id: true },
            });
            const foundIds = new Set(found.map((p) => p.id));
            const missing = ids.filter((pid) => !foundIds.has(pid));
            if (missing.length) throw new BadRequestException(`Products not found: ${missing.join(', ')}`);
        }
        await this.prisma.$transaction([
            this.prisma.productWearWith.deleteMany({ where: { productId: id } }),
            this.prisma.productWearWith.createMany({
                data: ids.map((relatedProductId, sortOrder) => ({ productId: id, relatedProductId, sortOrder })),
            }),
        ]);
        await this.cacheService.invalidateRelated();
        return this.getWearWith(id);
    }

    private async ensureProduct(id: number): Promise<void> {
        const product = await this.prisma.product.findFirst({
            where: { id, deletedAt: null },
            select: { id: true },
        });
        if (!product) throw new NotFoundException(`Product with id ${id} not found`);
    }
}
