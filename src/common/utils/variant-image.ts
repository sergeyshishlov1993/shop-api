import { MediaType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface FileRecord {
  id: number;
  s3Key: string;
  s3KeyThumb: string | null;
  s3KeyMedium: string | null;
  s3KeyLarge: string | null;
}

const FILE_RECORD_SELECT = {
  id: true,
  s3Key: true,
  s3KeyThumb: true,
  s3KeyMedium: true,
  s3KeyLarge: true,
} as const;

/**
 * Головне фото товару для кожного варіанта (для превʼю позицій замовлення/повернення).
 * Пріоритет: фото варіанта → головне фото товару → перше за sortOrder.
 */
export async function loadVariantImages(
  prisma: PrismaService,
  variantIds: Array<number | null | undefined>,
): Promise<Map<number, FileRecord | null>> {
  const ids = [...new Set(variantIds.filter((id): id is number => typeof id === 'number'))];
  const result = new Map<number, FileRecord | null>();
  if (ids.length === 0) return result;

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: ids } },
    select: { id: true, productId: true },
  });
  const productIds = [...new Set(variants.map((v) => v.productId))];
  const media = await prisma.productMedia.findMany({
    where: { productId: { in: productIds }, mediaType: MediaType.IMAGE },
    orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    select: { productId: true, variantId: true, file: { select: FILE_RECORD_SELECT } },
  });

  for (const variant of variants) {
    const own = media.find((m) => m.variantId === variant.id);
    const main = media.find((m) => m.productId === variant.productId);
    result.set(variant.id, (own ?? main)?.file ?? null);
  }
  return result;
}
