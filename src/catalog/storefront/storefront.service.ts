import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma, ProductType, FileType } from '@prisma/client';
import { QueryStorefrontProductsDto, StorefrontSort } from './dto';

const LOW_STOCK_THRESHOLD = 3;

interface AvailableVariantRow {
    productId: number;
    variantId: number;
    sizeId: number | null;
    sizeName: string | null;
    colorId: number | null;
    colorName: string | null;
    hexCode: string | null;
    effectivePrice: number;
    availableQty: number;
    brand: string | null;
    season: string | null;
    material: string | null;
}

type ProductCardImage = { id: number; s3Key: string; s3KeyThumb: string | null; s3KeyMedium: string | null; s3KeyLarge: string | null };

type CardMediaRow = { productId: number; isMain: boolean; isHover: boolean; file: ProductCardImage | null };

/** hover: IMAGE з isHover; інакше перше не-головне фото за sortOrder (rows вже відсортовані). */
export function pickHoverImage(rows: CardMediaRow[]): ProductCardImage | null {
    const hover = rows.find((m) => m.isHover && m.file);
    if (hover) return hover.file;
    const imgs = rows.filter((m) => m.file);
    const main = imgs.find((m) => m.isMain) ?? imgs[0];
    return imgs.find((m) => m !== main)?.file ?? null;
}

type CardVariantRow = { id: number; stockQty: number; reservedQty: number; size: { name: string; sortOrder: number } | null };

/** Розміри для швидкого додавання з картки + дефолтний варіант для товарів без розмірів. */
export function buildCardSizes(variants: CardVariantRow[]) {
    const sizes = variants
        .filter((v) => v.size)
        .sort((a, b) => a.size!.sortOrder - b.size!.sortOrder || a.id - b.id)
        .map((v) => ({ variantId: v.id, name: v.size!.name, available: v.stockQty - v.reservedQty > 0 }));
    const defaultVariantId = sizes.length ? null : (variants.find((v) => v.stockQty - v.reservedQty > 0)?.id ?? null);
    return { sizes, defaultVariantId };
}

export interface ProductCard {
    id: number;
    name: string;
    slug: string;
    productType: ProductType;
    brand: string | null;
    basePrice: number;
    oldPrice: number | null;
    isNew: boolean;
    isHit: boolean;
    isSeasonal: boolean;
    effectivePrice: number;
    availabilityStatus: 'IN_STOCK' | 'LOW_STOCK';
    mainImage: { id: number; s3Key: string; s3KeyThumb: string | null; s3KeyMedium: string | null; s3KeyLarge: string | null } | null;
    hoverImage: ProductCardImage | null;
    sizes: { variantId: number; name: string; available: boolean }[];
    defaultVariantId: number | null;
    hoverVideo: { id: number; s3Key: string; s3KeyThumb: string | null; s3KeyMedium: string | null; s3KeyLarge: string | null; fileType: FileType; originalName: string } | null;
    averageRating: number | null;
    reviewCount: number;
}

@Injectable()
export class StorefrontService {
    constructor(private readonly prisma: PrismaService) {}

    async findAll(dto: QueryStorefrontProductsDto) {
        const categoryIds = await this.resolveCategoryIds(dto.category);
        const baseWhere = this.buildBaseWhere(dto, categoryIds);
        const { conditions, params } = this.buildVariantConditions(dto);
        const availableProducts = await this.getAvailableProductIds(baseWhere, conditions, params);
        if (availableProducts.length === 0) {
            return { items: [], totalCount: 0, filters: await this.buildEmptyFilters() };
        }
        const uniqueProductIds = [...new Set(availableProducts.map((r) => r.productId))];
        const sortedPaginatedIds = await this.sortAndPaginate(uniqueProductIds, availableProducts, dto);
        const items = await this.buildProductCards(sortedPaginatedIds, availableProducts);
        return { items, totalCount: uniqueProductIds.length, filters: await this.buildFilters(dto, categoryIds) };
    }

    async findBySlug(slug: string) {
        const product = await this.prisma.product.findFirst({
            where: { slug, isActive: true, deletedAt: null },
            include: {
                category: {
                    select: {
                        id: true, name: true, slug: true, parentId: true,
                        parent: {
                            select: {
                                id: true, name: true, slug: true, parentId: true,
                                parent: { select: { id: true, name: true, slug: true } },
                            },
                        },
                    },
                },
                hoverVideoFile: {
                    select: { id: true, s3Key: true, s3KeyThumb: true, s3KeyMedium: true, s3KeyLarge: true, fileType: true, originalName: true },
                },
                media: {
                    include: {
                        file: {
                            select: { id: true, s3Key: true, s3KeyThumb: true, s3KeyMedium: true, s3KeyLarge: true, fileType: true, originalName: true },
                        },
                    },
                    orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }],
                },
                variants: {
                    where: { isActive: true, deletedAt: null },
                    include: {
                        size: { select: { id: true, name: true, sizeType: true } },
                        color: { select: { id: true, name: true, hexCode: true } },
                    },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });
        if (!product) throw new NotFoundException(`Product with slug "${slug}" not found`);

        const availableVariants = product.variants
            .filter((v) => v.stockQty - v.reservedQty > 0)
            .map((v) => {
                const availableQty = v.stockQty - v.reservedQty;
                return {
                    id: v.id, sku: v.sku, size: v.size, color: v.color,
                    price: v.price ?? product.basePrice,
                    stockQty: v.stockQty, availableQty,
                    availabilityStatus: availableQty > LOW_STOCK_THRESHOLD ? ('IN_STOCK' as const) : ('LOW_STOCK' as const),
                };
            });

        const breadcrumb = this.buildBreadcrumb(product.category);
        // Рейтинг — необязательный блок: его сбой не должен ронять карточку товара.
        const reviewAgg = await this.prisma.review
            .aggregate({
                where: { productId: product.id, status: 'APPROVED', parentId: null },
                _avg: { rating: true }, _count: { id: true },
            })
            .catch(() => ({ _avg: { rating: null }, _count: { id: 0 } }));

        return {
            id: product.id, name: product.name, slug: product.slug,
            description: product.description, productType: product.productType,
            brand: product.brand, season: product.season, material: product.material,
            basePrice: product.basePrice, oldPrice: product.oldPrice,
            isNew: product.isNew, isHit: product.isHit, isSeasonal: product.isSeasonal,
            category: { id: product.category.id, name: product.category.name, slug: product.category.slug, breadcrumb },
            media: product.media.map((m) => ({ id: m.id, mediaType: m.mediaType, isMain: m.isMain, sortOrder: m.sortOrder, variantId: m.variantId, focalX: m.focalX, focalY: m.focalY, externalUrl: m.externalUrl, file: m.file })),
            hoverVideo: product.hoverVideoFile,
            variants: availableVariants,
            outOfStock: availableVariants.length === 0,
            seo: { metaTitle: product.metaTitle, metaDescription: product.metaDescription },
            averageRating: reviewAgg._avg.rating ? Math.round(reviewAgg._avg.rating * 10) / 10 : null,
            reviewCount: reviewAgg._count.id,
        };
    }

    async findRelated(slug: string) {
        const product = await this.prisma.product.findFirst({
            where: { slug, isActive: true, deletedAt: null },
            select: { id: true, categoryId: true, productType: true, brand: true },
        });
        if (!product) throw new NotFoundException(`Product with slug "${slug}" not found`);
        const [manual, bought, similar] = await Promise.allSettled([
            this.getManualWearWithIds(product.id),
            this.getBoughtTogetherIds(product.id, 16),
            this.getSimilarIds(product, 8),
        ]);
        const manualIds = manual.status === 'fulfilled' ? manual.value : [];
        const boughtIds = bought.status === 'fulfilled' ? bought.value : [];
        const similarIds = similar.status === 'fulfilled' ? similar.value : [];
        return this.selectRelated(product, manualIds, boughtIds, similarIds);
    }

    /**
     * wearWith: ручний список; якщо порожній — «купують разом» з інших категорій.
     * similar: схожі + «купують разом» без wearWith, максимум 8.
     */
    private async selectRelated(
        product: { id: number; categoryId: number },
        manualIds: number[],
        boughtIds: number[],
        similarIds: number[],
    ) {
        let wearIds = manualIds;
        if (wearIds.length === 0 && boughtIds.length > 0) {
            const otherCat = await this.prisma.product.findMany({
                where: { id: { in: boughtIds }, categoryId: { not: product.categoryId } },
                select: { id: true },
            });
            const otherSet = new Set(otherCat.map((p) => p.id));
            wearIds = boughtIds.filter((id) => otherSet.has(id)).slice(0, 8);
        }
        const wearWith = await this.getRelatedCards(wearIds);
        const wearSet = new Set(wearWith.map((c) => c.id));
        const mergedIds = [...new Set([...similarIds, ...boughtIds])].filter((id) => id !== product.id && !wearSet.has(id));
        const similar = (await this.getRelatedCards(mergedIds)).slice(0, 8);
        const boughtTogether = await this.getRelatedCards(boughtIds.slice(0, 8));
        return { wearWith, similar, boughtTogether };
    }

    private async getManualWearWithIds(productId: number): Promise<number[]> {
        const rows = await this.prisma.productWearWith.findMany({
            where: { productId, relatedProduct: { isActive: true, deletedAt: null } },
            orderBy: { sortOrder: 'asc' },
            select: { relatedProductId: true },
        });
        return rows.map((r) => r.relatedProductId);
    }

    private async resolveCategoryIds(category?: string): Promise<number[] | undefined> {
        if (!category) return undefined;
        const isNumeric = /^\d+$/.test(category);
        const cat = await this.prisma.category.findFirst({
            where: isNumeric
                ? { id: parseInt(category, 10), isActive: true, deletedAt: null }
                : { slug: category, isActive: true, deletedAt: null },
            select: { id: true },
        });
        if (!cat) return [];
        const children = await this.prisma.category.findMany({
            where: { parentId: cat.id, isActive: true, deletedAt: null },
            select: { id: true },
        });
        return [cat.id, ...children.map((c) => c.id)];
    }

    private buildBaseWhere(dto: QueryStorefrontProductsDto, categoryIds?: number[]): Prisma.ProductWhereInput {
        const where: Prisma.ProductWhereInput = { isActive: true, deletedAt: null };
        if (categoryIds !== undefined) where.categoryId = { in: categoryIds };
        if (dto.productType?.length) where.productType = { in: dto.productType };

        // brand/season/material сравниваем без учёта регистра, а Prisma `in` не
        // поддерживает mode: 'insensitive' — поэтому каждый набор разворачиваем в OR.
        const and: Prisma.ProductWhereInput[] = [];
        const insensitiveIn = (
            field: 'brand' | 'season' | 'material',
            values?: string[],
        ): void => {
            if (!values?.length) return;
            and.push({
                OR: values.map((value) => ({
                    [field]: { equals: value, mode: 'insensitive' as const },
                })),
            });
        };
        insensitiveIn('brand', dto.brand);
        insensitiveIn('season', dto.season);
        insensitiveIn('material', dto.material);
        if (and.length) where.AND = and;

        if (dto.isNew !== undefined) where.isNew = dto.isNew;
        if (dto.isHit !== undefined) where.isHit = dto.isHit;
        if (dto.isSeasonal !== undefined) where.isSeasonal = dto.isSeasonal;
        if (dto.search) {
            where.OR = [
                { name: { contains: dto.search, mode: 'insensitive' } },
                { slug: { contains: dto.search, mode: 'insensitive' } },
                { brand: { contains: dto.search, mode: 'insensitive' } },
                { variants: { some: { sku: { contains: dto.search, mode: 'insensitive' } } } },
            ];
        }
        return where;
    }

    private buildVariantConditions(dto: QueryStorefrontProductsDto): { conditions: string; params: unknown[] } {
        const clauses: string[] = [
            'v."isActive" = true',
            'v."deletedAt" IS NULL',
            '(v."stockQty" - v."reservedQty") > 0',
        ];
        const params: unknown[] = [];
        let paramIndex = 2;

        if (dto.size?.length) {
            clauses.push(`v."sizeId" = ANY($${paramIndex}::int[])`);
            params.push(dto.size);
            paramIndex++;
        }
        if (dto.color?.length) {
            clauses.push(`v."colorId" = ANY($${paramIndex}::int[])`);
            params.push(dto.color);
            paramIndex++;
        }
        if (dto.priceMin !== undefined) {
            clauses.push(`COALESCE(v."price", p."basePrice") >= $${paramIndex}`);
            params.push(Number(dto.priceMin));
            paramIndex++;
        }
        if (dto.priceMax !== undefined) {
            clauses.push(`COALESCE(v."price", p."basePrice") <= $${paramIndex}`);
            params.push(Number(dto.priceMax));
            paramIndex++;
        }

        return { conditions: clauses.join(' AND '), params };
    }

    private async getAvailableProductIds(
        baseWhere: Prisma.ProductWhereInput,
        variantConditions: string,
        variantParams: unknown[],
    ): Promise<AvailableVariantRow[]> {
        const candidates = await this.prisma.product.findMany({ where: baseWhere, select: { id: true } });
        if (candidates.length === 0) return [];
        const ids = candidates.map((p) => p.id);
        return this.prisma.$queryRawUnsafe<AvailableVariantRow[]>(
            `SELECT v."productId" AS "productId", v."id" AS "variantId", v."sizeId" AS "sizeId",
        s."name" AS "sizeName", v."colorId" AS "colorId", c."name" AS "colorName", c."hexCode" AS "hexCode",
        COALESCE(v."price", p."basePrice") AS "effectivePrice",
        (v."stockQty" - v."reservedQty") AS "availableQty",
        p."brand", p."season", p."material"
      FROM "ProductVariant" v
      JOIN "Product" p ON p."id" = v."productId"
      LEFT JOIN "Size" s ON s."id" = v."sizeId"
      LEFT JOIN "Color" c ON c."id" = v."colorId"
      WHERE v."productId" = ANY($1::int[]) AND ${variantConditions}`,
            ids,
            ...variantParams,
        );
    }

    private async sortAndPaginate(productIds: number[], variantRows: AvailableVariantRow[], dto: QueryStorefrontProductsDto): Promise<number[]> {
        const priceMap = new Map<number, number>();
        for (const row of variantRows) {
            const cur = priceMap.get(row.productId);
            const price = Number(row.effectivePrice);
            if (cur === undefined || price < cur) priceMap.set(row.productId, price);
        }
        const sort = dto.sort ?? StorefrontSort.NEWEST;
        let sorted: number[];
        if (sort === StorefrontSort.PRICE_ASC) {
            sorted = [...productIds].sort((a, b) => (priceMap.get(a) ?? 0) - (priceMap.get(b) ?? 0));
        } else if (sort === StorefrontSort.PRICE_DESC) {
            sorted = [...productIds].sort((a, b) => (priceMap.get(b) ?? 0) - (priceMap.get(a) ?? 0));
        } else if (sort === StorefrontSort.NAME_ASC) {
            const prods = await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } });
            const nm = new Map(prods.map((p) => [p.id, p.name]));
            sorted = [...productIds].sort((a, b) => (nm.get(a) ?? '').localeCompare(nm.get(b) ?? '', 'uk'));
        } else {
            sorted = [...productIds].sort((a, b) => b - a);
        }
        const page = dto.page ?? 1;
        const limit = dto.limit ?? 20;
        return sorted.slice((page - 1) * limit, page * limit);
    }

    private async buildProductCards(productIds: number[], variantRows: AvailableVariantRow[]): Promise<ProductCard[]> {
        if (productIds.length === 0) return [];
        const products = await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: {
                id: true, name: true, slug: true, productType: true, brand: true,
                basePrice: true, oldPrice: true, isNew: true, isHit: true, isSeasonal: true,
                hoverVideoFile: {
                    select: { id: true, s3Key: true, s3KeyThumb: true, s3KeyMedium: true, s3KeyLarge: true, fileType: true, originalName: true },
                },
            },
        });
        const mainMedia = await this.prisma.productMedia.findMany({
            where: { productId: { in: productIds }, isMain: true },
            include: { file: { select: { id: true, s3Key: true, s3KeyThumb: true, s3KeyMedium: true, s3KeyLarge: true } } },
        });
        const mediaMap = new Map(mainMedia.map((m) => [m.productId, m.file]));
        const [imageMedia, variants] = await Promise.all([
            this.prisma.productMedia.findMany({
                where: { productId: { in: productIds }, mediaType: 'IMAGE', fileId: { not: null } },
                orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
                select: { productId: true, isMain: true, isHover: true, file: { select: { id: true, s3Key: true, s3KeyThumb: true, s3KeyMedium: true, s3KeyLarge: true } } },
            }),
            this.prisma.productVariant.findMany({
                where: { productId: { in: productIds }, isActive: true, deletedAt: null },
                select: { id: true, productId: true, stockQty: true, reservedQty: true, size: { select: { name: true, sortOrder: true } } },
                orderBy: { id: 'asc' },
            }),
        ]);
        const group = <T extends { productId: number }>(rows: T[]) => {
            const m = new Map<number, T[]>();
            for (const r of rows) m.set(r.productId, [...(m.get(r.productId) ?? []), r]);
            return m;
        };
        const imagesByProduct = group(imageMedia);
        const variantsByProduct = group(variants);
        const reviewAggs = await this.prisma.review.groupBy({
            by: ['productId'],
            where: { productId: { in: productIds }, status: 'APPROVED', parentId: null },
            _avg: { rating: true }, _count: { id: true },
        });
        const reviewMap = new Map(reviewAggs.map((r) => [r.productId, { avg: r._avg.rating ? Math.round(r._avg.rating * 10) / 10 : null, count: r._count.id }]));
        const psMap = new Map<number, { effectivePrice: number; availabilityStatus: 'IN_STOCK' | 'LOW_STOCK' }>();
        for (const row of variantRows) {
            const price = Number(row.effectivePrice);
            const qty = Number(row.availableQty);
            const ex = psMap.get(row.productId);
            if (!ex) {
                psMap.set(row.productId, { effectivePrice: price, availabilityStatus: qty > LOW_STOCK_THRESHOLD ? 'IN_STOCK' : 'LOW_STOCK' });
            } else {
                if (price < ex.effectivePrice) ex.effectivePrice = price;
                if (qty > LOW_STOCK_THRESHOLD) ex.availabilityStatus = 'IN_STOCK';
            }
        }
        const pMap = new Map(products.map((p) => [p.id, p]));
        return productIds.map((id) => {
            const p = pMap.get(id);
            if (!p) return null;
            const ps = psMap.get(id);
            const rv = reviewMap.get(id);
            return {
                id: p.id, name: p.name, slug: p.slug, productType: p.productType, brand: p.brand,
                basePrice: p.basePrice, oldPrice: p.oldPrice, isNew: p.isNew, isHit: p.isHit, isSeasonal: p.isSeasonal,
                effectivePrice: ps?.effectivePrice ?? p.basePrice,
                availabilityStatus: ps?.availabilityStatus ?? 'LOW_STOCK',
                mainImage: mediaMap.get(id) ?? null,
                hoverImage: pickHoverImage(imagesByProduct.get(id) ?? []),
                ...buildCardSizes(variantsByProduct.get(id) ?? []),
                hoverVideo: p.hoverVideoFile ?? null,
                averageRating: rv?.avg ?? null, reviewCount: rv?.count ?? 0,
            };
        }).filter((item): item is ProductCard => item !== null);
    }

    private async buildFilters(dto: QueryStorefrontProductsDto, categoryIds?: number[]) {
        const [sizes, colors, brands, seasons, materials, priceRange] = await Promise.all([
            this.getFilterCounts('size', dto, categoryIds),
            this.getFilterCounts('color', dto, categoryIds),
            this.getFilterCounts('brand', dto, categoryIds),
            this.getFilterCounts('season', dto, categoryIds),
            this.getFilterCounts('material', dto, categoryIds),
            this.getPriceRange(dto, categoryIds),
        ]);
        return { sizes, colors, brands, seasons, materials, priceRange };
    }

    private async buildEmptyFilters() {
        return { sizes: [], colors: [], brands: [], seasons: [], materials: [], priceRange: { min: 0, max: 0 } };
    }

    private buildFilterQuery(
        filterType: string,
        dto: QueryStorefrontProductsDto,
        categoryIds?: number[],
    ): { clauses: string[]; params: unknown[] } {
        const clauses: string[] = [
            'p."isActive" = true',
            'p."deletedAt" IS NULL',
            'v."isActive" = true',
            'v."deletedAt" IS NULL',
            '(v."stockQty" - v."reservedQty") > 0',
        ];
        const params: unknown[] = [];
        let idx = 1;

        if (categoryIds !== undefined && categoryIds.length > 0) {
            clauses.push(`p."categoryId" = ANY($${idx}::int[])`);
            params.push(categoryIds);
            idx++;
        }
        if (dto.productType?.length) {
            clauses.push(`p."productType"::text = ANY($${idx}::text[])`);
            params.push(dto.productType);
            idx++;
        }
        if (dto.isNew !== undefined) {
            clauses.push(`p."isNew" = $${idx}`);
            params.push(dto.isNew);
            idx++;
        }
        if (dto.isHit !== undefined) {
            clauses.push(`p."isHit" = $${idx}`);
            params.push(dto.isHit);
            idx++;
        }
        if (dto.isSeasonal !== undefined) {
            clauses.push(`p."isSeasonal" = $${idx}`);
            params.push(dto.isSeasonal);
            idx++;
        }
        if (dto.search) {
            clauses.push(`(p."name" ILIKE $${idx} OR p."slug" ILIKE $${idx} OR p."brand" ILIKE $${idx} OR v."sku" ILIKE $${idx})`);
            params.push(`%${dto.search}%`);
            idx++;
        }
        if (filterType !== 'size' && dto.size?.length) {
            clauses.push(`v."sizeId" = ANY($${idx}::int[])`);
            params.push(dto.size);
            idx++;
        }
        if (filterType !== 'color' && dto.color?.length) {
            clauses.push(`v."colorId" = ANY($${idx}::int[])`);
            params.push(dto.color);
            idx++;
        }
        if (filterType !== 'brand' && dto.brand?.length) {
            clauses.push(`p."brand" ILIKE ANY($${idx}::text[])`);
            params.push(dto.brand);
            idx++;
        }
        if (filterType !== 'season' && dto.season?.length) {
            clauses.push(`p."season" ILIKE ANY($${idx}::text[])`);
            params.push(dto.season);
            idx++;
        }
        if (filterType !== 'material' && dto.material?.length) {
            clauses.push(`p."material" ILIKE ANY($${idx}::text[])`);
            params.push(dto.material);
            idx++;
        }
        if (filterType !== 'price' && dto.priceMin !== undefined) {
            clauses.push(`COALESCE(v."price", p."basePrice") >= $${idx}`);
            params.push(Number(dto.priceMin));
            idx++;
        }
        if (filterType !== 'price' && dto.priceMax !== undefined) {
            clauses.push(`COALESCE(v."price", p."basePrice") <= $${idx}`);
            params.push(Number(dto.priceMax));
            idx++;
        }

        return { clauses, params };
    }

    private async getFilterCounts(
        filterType: 'size' | 'color' | 'brand' | 'season' | 'material',
        dto: QueryStorefrontProductsDto,
        categoryIds?: number[],
    ) {
        const { clauses, params } = this.buildFilterQuery(filterType, dto, categoryIds);
        const where = clauses.join(' AND ');

        if (filterType === 'size') {
            return this.prisma.$queryRawUnsafe<{ id: number; name: string; count: number }[]>(
                `SELECT s."id", s."name", COUNT(DISTINCT p."id")::int AS "count"
         FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
         JOIN "Size" s ON s."id" = v."sizeId"
         WHERE ${where} GROUP BY s."id", s."name" ORDER BY s."name"`,
                ...params,
            );
        }
        if (filterType === 'color') {
            return this.prisma.$queryRawUnsafe<{ id: number; name: string; hexCode: string | null; count: number }[]>(
                `SELECT c."id", c."name", c."hexCode", COUNT(DISTINCT p."id")::int AS "count"
         FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
         JOIN "Color" c ON c."id" = v."colorId"
         WHERE ${where} GROUP BY c."id", c."name", c."hexCode" ORDER BY c."name"`,
                ...params,
            );
        }
        if (filterType === 'brand') {
            return this.prisma.$queryRawUnsafe<{ value: string; count: number }[]>(
                `SELECT p."brand" AS "value", COUNT(DISTINCT p."id")::int AS "count"
         FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
         WHERE ${where} AND p."brand" IS NOT NULL GROUP BY p."brand" ORDER BY p."brand"`,
                ...params,
            );
        }
        if (filterType === 'season') {
            return this.prisma.$queryRawUnsafe<{ value: string; count: number }[]>(
                `SELECT p."season" AS "value", COUNT(DISTINCT p."id")::int AS "count"
         FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
         WHERE ${where} AND p."season" IS NOT NULL GROUP BY p."season" ORDER BY p."season"`,
                ...params,
            );
        }
        return this.prisma.$queryRawUnsafe<{ value: string; count: number }[]>(
            `SELECT p."material" AS "value", COUNT(DISTINCT p."id")::int AS "count"
       FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
       WHERE ${where} AND p."material" IS NOT NULL GROUP BY p."material" ORDER BY p."material"`,
            ...params,
        );
    }

    private async getPriceRange(dto: QueryStorefrontProductsDto, categoryIds?: number[]) {
        const { clauses, params } = this.buildFilterQuery('price', dto, categoryIds);
        const where = clauses.join(' AND ');
        const result = await this.prisma.$queryRawUnsafe<{ min: number; max: number }[]>(
            `SELECT COALESCE(MIN(COALESCE(v."price", p."basePrice")), 0) AS "min",
              COALESCE(MAX(COALESCE(v."price", p."basePrice")), 0) AS "max"
       FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
       WHERE ${where}`,
            ...params,
        );
        return { min: Number(result[0]?.min ?? 0), max: Number(result[0]?.max ?? 0) };
    }

    private buildBreadcrumb(category: {
        id: number; name: string; slug: string; parentId: number | null;
        parent?: { id: number; name: string; slug: string; parentId: number | null; parent?: { id: number; name: string; slug: string } | null } | null;
    }) {
        const crumbs: { id: number; name: string; slug: string }[] = [];
        if (category.parent?.parent) crumbs.push({ id: category.parent.parent.id, name: category.parent.parent.name, slug: category.parent.parent.slug });
        if (category.parent) crumbs.push({ id: category.parent.id, name: category.parent.name, slug: category.parent.slug });
        crumbs.push({ id: category.id, name: category.name, slug: category.slug });
        return crumbs;
    }

    private async getBoughtTogetherIds(productId: number, limit: number): Promise<number[]> {
        const rows = await this.prisma.$queryRawUnsafe<{ productId: number; frequency: number }[]>(`
      SELECT pv2."productId" AS "productId", COUNT(DISTINCT o."id")::int AS "frequency"
      FROM "OrderItem" oi1
      JOIN "Order" o ON o."id" = oi1."orderId"
      JOIN "OrderItem" oi2 ON oi2."orderId" = o."id"
      JOIN "ProductVariant" pv1 ON pv1."id" = oi1."productVariantId"
      JOIN "ProductVariant" pv2 ON pv2."id" = oi2."productVariantId"
      JOIN "Product" p2 ON p2."id" = pv2."productId"
      WHERE pv1."productId" = $1 AND pv2."productId" != $1
        AND p2."isActive" = true AND p2."deletedAt" IS NULL AND o."status" != 'CANCELLED'
      GROUP BY pv2."productId" ORDER BY "frequency" DESC LIMIT $2
    `, productId, limit);
        return rows.map((r) => r.productId);
    }

    private async getSimilarIds(product: { id: number; categoryId: number; productType: ProductType; brand: string | null }, limit: number): Promise<number[]> {
        const orCond: Prisma.ProductWhereInput[] = [{ categoryId: product.categoryId }, { productType: product.productType }];
        if (product.brand) orCond.push({ brand: product.brand });
        const similar = await this.prisma.product.findMany({
            where: {
                id: { not: product.id }, isActive: true, deletedAt: null, OR: orCond,
                variants: { some: { isActive: true, deletedAt: null, stockQty: { gt: 0 } } },
            },
            select: { id: true }, take: limit, orderBy: { createdAt: 'desc' },
        });
        return similar.map((p) => p.id);
    }

    private async getRelatedCards(productIds: number[]): Promise<ProductCard[]> {
        if (productIds.length === 0) return [];
        const variantRows = await this.prisma.$queryRawUnsafe<AvailableVariantRow[]>(`
      SELECT v."productId" AS "productId", v."id" AS "variantId", v."sizeId" AS "sizeId",
        s."name" AS "sizeName", v."colorId" AS "colorId", c."name" AS "colorName", c."hexCode" AS "hexCode",
        COALESCE(v."price", p."basePrice") AS "effectivePrice",
        (v."stockQty" - v."reservedQty") AS "availableQty",
        p."brand", p."season", p."material"
      FROM "ProductVariant" v
      JOIN "Product" p ON p."id" = v."productId"
      LEFT JOIN "Size" s ON s."id" = v."sizeId"
      LEFT JOIN "Color" c ON c."id" = v."colorId"
      WHERE v."productId" = ANY($1::int[]) AND v."isActive" = true AND v."deletedAt" IS NULL AND (v."stockQty" - v."reservedQty") > 0
    `, productIds);
        const availableIds = new Set(variantRows.map((r) => r.productId));
        return this.buildProductCards(productIds.filter((id) => availableIds.has(id)), variantRows);
    }
}