import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { QueryFavoritesDto } from './dto/query-favorites.dto';

@Injectable()
export class FavoriteService {
    constructor(private readonly prisma: PrismaService) {}

    async findAll(userId: number, dto: QueryFavoritesDto) {
        const { page = 1, limit = 20 } = dto;
        const skip = (page - 1) * limit;

        const where: Prisma.FavoriteWhereInput = {
            userId,
            product: {
                isActive: true,
                deletedAt: null,
                variants: {
                    some: {
                        isActive: true,
                        deletedAt: null,
                        stockQty: { gt: 0 },
                    },
                },
            },
        };

        const [items, totalCount] = await Promise.all([
            this.prisma.favorite.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    product: {
                        include: {
                            media: {
                                where: { isMain: true },
                                take: 1,
                                include: { file: true },
                            },
                            variants: {
                                where: {
                                    isActive: true,
                                    deletedAt: null,
                                    stockQty: { gt: 0 },
                                },
                                select: {
                                    price: true,
                                    stockQty: true,
                                    reservedQty: true,
                                },
                            },
                            category: {
                                select: { id: true, name: true, slug: true },
                            },
                        },
                    },
                },
            }),
            this.prisma.favorite.count({ where }),
        ]);

        const settings = await this.prisma.storeSettings.findFirst();
        const lowStockThreshold = settings?.defaultLowStockThreshold ?? 3;

        const ratings = await this.getRatings(items.map((fav) => fav.product.id));

        const mapped = items.map((fav) => {
            const product = fav.product;
            const prices = product.variants.map((v) => v.price ?? product.basePrice);
            const effectivePrice = prices.length > 0 ? Math.min(...prices) : product.basePrice;

            const availabilityStatus = product.variants.some(
                (v) => v.stockQty - v.reservedQty > lowStockThreshold,
            ) ? 'IN_STOCK' : 'LOW_STOCK';
            const mainFile = product.media[0]?.file;

            return {
                favoriteId: fav.id,
                createdAt: fav.createdAt,
                product: {
                    id: product.id,
                    name: product.name,
                    slug: product.slug,
                    brand: product.brand,
                    basePrice: product.basePrice,
                    effectivePrice,
                    availabilityStatus,
                    isNew: product.isNew,
                    isHit: product.isHit,
                    isSeasonal: product.isSeasonal,
                    category: product.category,
                    mainMedia: mainFile
                        ? { id: mainFile.id, url: mainFile.s3Key, alt: mainFile.originalName }
                        : null,
                    averageRating: ratings.get(product.id)?.avg ?? 0,
                    reviewCount: ratings.get(product.id)?.count ?? 0,
                },
            };
        });

        return {
            items: mapped,
            totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit),
        };
    }

    async add(userId: number, productId: number) {
        const product = await this.prisma.product.findFirst({
            where: { id: productId, isActive: true, deletedAt: null },
        });

        if (!product) {
            throw new NotFoundException('Product not found or inactive');
        }

        const existing = await this.prisma.favorite.findUnique({
            where: { userId_productId: { userId, productId } },
        });

        if (existing) {
            throw new ConflictException('Product already in favorites');
        }

        const favorite = await this.prisma.favorite.create({ data: { userId, productId } });
        return { favoriteId: favorite.id, productId };
    }

    async remove(userId: number, productId: number) {
        const existing = await this.prisma.favorite.findUnique({
            where: { userId_productId: { userId, productId } },
        });

        if (!existing) {
            throw new NotFoundException('Favorite not found');
        }

        await this.prisma.favorite.delete({
            where: { userId_productId: { userId, productId } },
        });
    }

    async check(userId: number, productIds: number[]) {
        const favorites = await this.prisma.favorite.findMany({
            where: {
                userId,
                productId: { in: productIds },
            },
            select: { productId: true },
        });

        const favoriteProductIds = new Set(favorites.map((f) => f.productId));

        return productIds.map((productId) => ({
            productId,
            isFavorite: favoriteProductIds.has(productId),
        }));
    }

    async getRecommendations(userId: number, limit = 12) {
        const userFavorites = await this.prisma.favorite.findMany({
            where: { userId },
            include: {
                product: {
                    select: {
                        id: true,
                        categoryId: true,
                        productType: true,
                        brand: true,
                    },
                },
            },
        });

        const favoriteProductIds = userFavorites.map((f) => f.product.id);

        if (favoriteProductIds.length === 0) {
            return this.getPopularProducts([], limit);
        }

        const categoryIds = [...new Set(userFavorites.map((f) => f.product.categoryId))];
        const productTypes = [...new Set(userFavorites.map((f) => f.product.productType))];
        const brands = [
            ...new Set(
                userFavorites
                    .map((f) => f.product.brand)
                    .filter((b): b is string => b !== null),
            ),
        ];

        const baseWhere: Prisma.ProductWhereInput = {
            id: { notIn: favoriteProductIds },
            isActive: true,
            deletedAt: null,
            variants: {
                some: {
                    isActive: true,
                    deletedAt: null,
                    stockQty: { gt: 0 },
                },
            },
        };

        const sameCategoryAndBrand = brands.length > 0
            ? await this.findProducts({
                ...baseWhere,
                categoryId: { in: categoryIds },
                brand: { in: brands },
            }, limit)
            : [];

        const collectedIds = new Set(sameCategoryAndBrand.map((p) => p.id));
        let remaining = limit - sameCategoryAndBrand.length;

        let sameCategory: typeof sameCategoryAndBrand = [];
        if (remaining > 0) {
            sameCategory = await this.findProducts({
                ...baseWhere,
                id: { notIn: [...favoriteProductIds, ...collectedIds] },
                categoryId: { in: categoryIds },
            }, remaining);

            sameCategory.forEach((p) => collectedIds.add(p.id));
            remaining = limit - collectedIds.size;
        }

        let sameType: typeof sameCategoryAndBrand = [];
        if (remaining > 0) {
            sameType = await this.findProducts({
                ...baseWhere,
                id: { notIn: [...favoriteProductIds, ...collectedIds] },
                productType: { in: productTypes },
            }, remaining);

            sameType.forEach((p) => collectedIds.add(p.id));
            remaining = limit - collectedIds.size;
        }

        let popular: typeof sameCategoryAndBrand = [];
        if (remaining > 0) {
            popular = await this.getPopularProducts(
                [...favoriteProductIds, ...collectedIds],
                remaining,
            );
        }

        return this.mapProductCards([...sameCategoryAndBrand, ...sameCategory, ...sameType, ...popular]);
    }

    private async findProducts(where: Prisma.ProductWhereInput, take: number) {
        return this.prisma.product.findMany({
            where,
            take,
            orderBy: [
                { isHit: 'desc' },
                { isNew: 'desc' },
                { createdAt: 'desc' },
            ],
            include: {
                media: {
                    where: { isMain: true },
                    take: 1,
                    include: { file: true },
                },
                variants: {
                    where: {
                        isActive: true,
                        deletedAt: null,
                        stockQty: { gt: 0 },
                    },
                    select: {
                        price: true,
                        stockQty: true,
                        reservedQty: true,
                    },
                },
                category: {
                    select: { id: true, name: true, slug: true },
                },
            },
        });
    }

    private async getPopularProducts(excludeIds: number[], take: number) {
        return this.findProducts({
            ...(excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {}),
            isActive: true,
            deletedAt: null,
            variants: {
                some: {
                    isActive: true,
                    deletedAt: null,
                    stockQty: { gt: 0 },
                },
            },
            OR: [{ isHit: true }, { isNew: true }],
        }, take);
    }

    private async mapProductCards(products: Awaited<ReturnType<typeof this.findProducts>>) {
        const settings = await this.prisma.storeSettings.findFirst();
        const lowStockThreshold = settings?.defaultLowStockThreshold ?? 3;
        const ratings = await this.getRatings(products.map((p) => p.id));

        return products.map((product) => {
            const prices = product.variants.map((v) => v.price ?? product.basePrice);
            const effectivePrice = prices.length > 0 ? Math.min(...prices) : product.basePrice;

            const availabilityStatus = product.variants.some(
                (v) => v.stockQty - v.reservedQty > lowStockThreshold,
            ) ? 'IN_STOCK' : 'LOW_STOCK';
            const mainFile = product.media[0]?.file;

            return {
                id: product.id,
                name: product.name,
                slug: product.slug,
                brand: product.brand,
                basePrice: product.basePrice,
                effectivePrice,
                availabilityStatus,
                isNew: product.isNew,
                isHit: product.isHit,
                isSeasonal: product.isSeasonal,
                category: product.category,
                mainMedia: mainFile
                    ? { id: mainFile.id, url: mainFile.s3Key, alt: mainFile.originalName }
                    : null,
                averageRating: ratings.get(product.id)?.avg ?? 0,
                reviewCount: ratings.get(product.id)?.count ?? 0,
            };
        });
    }

    // Same aggregation as storefront product cards: approved top-level reviews
    private async getRatings(productIds: number[]) {
        if (productIds.length === 0) return new Map<number, { avg: number; count: number }>();
        const aggs = await this.prisma.review.groupBy({
            by: ['productId'],
            where: { productId: { in: productIds }, status: 'APPROVED', parentId: null },
            _avg: { rating: true }, _count: { id: true },
        });
        return new Map(aggs.map((r) => [r.productId, { avg: Math.round((r._avg.rating ?? 0) * 10) / 10, count: r._count.id }]));
    }
}
