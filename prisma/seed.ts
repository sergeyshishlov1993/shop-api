import {
    PrismaClient,
    UserRole,
    SizeType,
    ProductType,
    FileType,
    MediaType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seedAdmin(): Promise<void> {
    const email = process.env.ADMIN_EMAIL || 'admin@example.com';
    const password = process.env.ADMIN_PASSWORD || 'changeme';
    if (process.env.NODE_ENV === 'production' && (password === 'changeme' || password.length < 12)) {
        throw new Error('ADMIN_PASSWORD must be set (12+ chars, not "changeme") in production');
    }
    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.upsert({
        where: { email },
        update: {
            role: UserRole.ADMIN,
            passwordHash,
        },
        create: {
            email,
            passwordHash,
            firstName: 'Admin',
            lastName: 'Admin',
            role: UserRole.ADMIN,
            isActive: true,
        },
    });

    console.log(`  ✅ Admin: ${email}`);
}

async function seedSizes(): Promise<void> {
    const sizes = [
        { name: 'XS', sizeType: SizeType.CLOTHING, sortOrder: 1 },
        { name: 'S', sizeType: SizeType.CLOTHING, sortOrder: 2 },
        { name: 'M', sizeType: SizeType.CLOTHING, sortOrder: 3 },
        { name: 'L', sizeType: SizeType.CLOTHING, sortOrder: 4 },
        { name: 'XL', sizeType: SizeType.CLOTHING, sortOrder: 5 },
        { name: 'XXL', sizeType: SizeType.CLOTHING, sortOrder: 6 },
        { name: '36', sizeType: SizeType.SHOES, sortOrder: 1 },
        { name: '37', sizeType: SizeType.SHOES, sortOrder: 2 },
        { name: '38', sizeType: SizeType.SHOES, sortOrder: 3 },
        { name: '39', sizeType: SizeType.SHOES, sortOrder: 4 },
        { name: '40', sizeType: SizeType.SHOES, sortOrder: 5 },
        { name: '41', sizeType: SizeType.SHOES, sortOrder: 6 },
        { name: '42', sizeType: SizeType.SHOES, sortOrder: 7 },
        { name: '43', sizeType: SizeType.SHOES, sortOrder: 8 },
        { name: '44', sizeType: SizeType.SHOES, sortOrder: 9 },
        { name: '45', sizeType: SizeType.SHOES, sortOrder: 10 },
        { name: 'ONE_SIZE', sizeType: SizeType.ACCESSORY, sortOrder: 1 },
    ];

    for (const size of sizes) {
        const existing = await prisma.size.findFirst({
            where: { name: size.name, sizeType: size.sizeType },
        });

        if (existing) {
            await prisma.size.update({
                where: { id: existing.id },
                data: { sortOrder: size.sortOrder, isActive: true },
            });
        } else {
            await prisma.size.create({
                data: {
                    name: size.name,
                    sizeType: size.sizeType,
                    sortOrder: size.sortOrder,
                    isActive: true,
                },
            });
        }
    }

    console.log(`  ✅ Sizes: ${sizes.length}`);
}

async function seedColors(): Promise<void> {
    const colors = [
        { name: 'Чорний', hexCode: '#000000' },
        { name: 'Білий', hexCode: '#FFFFFF' },
        { name: 'Червоний', hexCode: '#FF0000' },
        { name: 'Синій', hexCode: '#0000FF' },
        { name: 'Зелений', hexCode: '#008000' },
        { name: 'Жовтий', hexCode: '#FFD700' },
        { name: 'Рожевий', hexCode: '#FFC0CB' },
        { name: 'Фіолетовий', hexCode: '#800080' },
        { name: 'Сірий', hexCode: '#808080' },
        { name: 'Коричневий', hexCode: '#8B4513' },
        { name: 'Бежевий', hexCode: '#F5F5DC' },
        { name: 'Помаранчевий', hexCode: '#FF8C00' },
        { name: 'Бордовий', hexCode: '#800020' },
        { name: 'Темно-синій', hexCode: '#000080' },
        { name: 'Оливковий', hexCode: '#808000' },
    ];

    for (const color of colors) {
        const existing = await prisma.color.findFirst({
            where: { name: color.name },
        });

        if (existing) {
            await prisma.color.update({
                where: { id: existing.id },
                data: { hexCode: color.hexCode, isActive: true },
            });
        } else {
            await prisma.color.create({
                data: { name: color.name, hexCode: color.hexCode, isActive: true },
            });
        }
    }

    console.log(`  ✅ Colors: ${colors.length}`);
}

async function seedCategories(): Promise<void> {
    const tree: {
        name: string;
        slug: string;
        productType: ProductType;
        isActive?: boolean;
        children: { name: string; slug: string }[];
    }[] = [
        {
            name: 'Для нареченої',
            slug: 'dlya-narechenoyi',
            productType: ProductType.CLOTHING,
            children: [],
        },
        {
            name: 'Шовкові комплекти',
            slug: 'shovkovi-komplekty',
            productType: ProductType.CLOTHING,
            children: [],
        },
        {
            name: 'Шифонові комплекти',
            slug: 'shyfonovi-komplekty',
            productType: ProductType.CLOTHING,
            children: [],
        },
        {
            name: 'Classic',
            slug: 'classic',
            productType: ProductType.CLOTHING,
            children: [],
        },
        {
            name: 'Одяг у білизняному стилі',
            slug: 'odyag-u-biliznyanomu-styli',
            productType: ProductType.CLOTHING,
            children: [],
        },
        {
            name: 'Вуличні костюми',
            slug: 'vulychni-kostyumy',
            productType: ProductType.CLOTHING,
            children: [
                { name: 'Велюрові костюми', slug: 'velyurovi-kostyumy' },
                { name: 'Костюми з турецької трьохнитки', slug: 'kostyumy-z-turetskoyi-trohnytky' },
            ],
        },
        {
            name: 'Топ комплектів для подарунків',
            slug: 'top-komplektiv-dlya-podarunkiv',
            productType: ProductType.CLOTHING,
            children: [],
        },
        {
            name: 'Сукні для святкового настрою',
            slug: 'sukni-dlya-svyatkovogo-nastroyu',
            productType: ProductType.CLOTHING,
            children: [],
        },
        {
            name: 'Велюрові домашні костюми',
            slug: 'velyurovi-domashni-kostyumy',
            productType: ProductType.CLOTHING,
            children: [],
        },
        {
            name: 'Одяг',
            slug: 'clothing',
            productType: ProductType.CLOTHING,
            isActive: false,
            children: [
                { name: 'Куртки', slug: 'kurtky' },
                { name: 'Светри', slug: 'svetry' },
                { name: 'Штани', slug: 'shtany' },
                { name: 'Сукні', slug: 'sukni' },
                { name: 'Футболки', slug: 'futbolky' },
            ],
        },
        {
            name: 'Взуття',
            slug: 'shoes',
            productType: ProductType.SHOES,
            isActive: false,
            children: [
                { name: 'Кросівки', slug: 'krosivky' },
                { name: 'Черевики', slug: 'cherevyky' },
                { name: 'Туфлі', slug: 'tufli' },
                { name: 'Сандалі', slug: 'sandali' },
            ],
        },
        {
            name: 'Аксесуари',
            slug: 'accessories',
            productType: ProductType.ACCESSORY,
            isActive: false,
            children: [
                { name: 'Сумки', slug: 'sumky' },
                { name: 'Ремені', slug: 'remeni' },
                { name: 'Шарфи', slug: 'sharfy' },
                { name: 'Окуляри', slug: 'okulyary' },
            ],
        },
    ];

    let count = 0;

    for (const parent of tree) {
        const parentCategory = await prisma.category.upsert({
            where: { slug: parent.slug },
            update: {
                name: parent.name,
                productType: parent.productType,
                isActive: parent.isActive ?? true,
                sortOrder: count,
                deletedAt: null,
            },
            create: {
                name: parent.name,
                slug: parent.slug,
                productType: parent.productType,
                isActive: parent.isActive ?? true,
                sortOrder: count,
            },
        });

        count++;

        for (let index = 0; index < parent.children.length; index += 1) {
            const child = parent.children[index];

            await prisma.category.upsert({
                where: { slug: child.slug },
                update: {
                    name: child.name,
                    parentId: parentCategory.id,
                    productType: parent.productType,
                    isActive: true,
                    deletedAt: null,
                },
                create: {
                    name: child.name,
                    slug: child.slug,
                    parentId: parentCategory.id,
                    productType: parent.productType,
                    isActive: true,
                    sortOrder: index,
                },
            });

            count++;
        }
    }

    console.log(`  ✅ Categories: ${count}`);
}

async function seedSettings(): Promise<void> {
    const existing = await prisma.storeSettings.findFirst();

    if (existing) {
        await prisma.storeSettings.update({
            where: { id: existing.id },
            data: { currency: 'UAH', defaultLowStockThreshold: 3 },
        });
    } else {
        await prisma.storeSettings.create({
            data: { currency: 'UAH', defaultLowStockThreshold: 3 },
        });
    }

    console.log('  ✅ StoreSettings');
}

async function seedPages(): Promise<void> {
    const pages = [
        { slug: 'about', title: 'Про нас' },
        { slug: 'delivery', title: 'Доставка і оплата' },
    ];

    for (const page of pages) {
        await prisma.pageContent.upsert({
            where: { slug: page.slug },
            update: { title: page.title, isActive: true },
            create: {
                slug: page.slug,
                title: page.title,
                contentJson: {},
                isActive: true,
            },
        });
    }

    console.log(`  ✅ Pages: ${pages.length}`);
}

async function seedSizeCharts(): Promise<void> {
    const charts: {
        categorySlug: string;
        columns: string[];
        rows: string[][];
    }[] = [
        {
            categorySlug: 'clothing',
            columns: ['Розмір', 'Груди (см)', 'Талія (см)', 'Бедра (см)'],
            rows: [
                ['XS', '80-84', '60-64', '86-90'],
                ['S', '84-88', '64-68', '90-94'],
                ['M', '88-92', '68-72', '94-98'],
                ['L', '92-96', '72-76', '98-102'],
                ['XL', '96-100', '76-80', '102-106'],
                ['XXL', '100-104', '80-84', '106-110'],
            ],
        },
        {
            categorySlug: 'kurtky',
            columns: ['Розмір', 'Груди (см)', 'Талія (см)', 'Довжина рукава (см)', 'Довжина виробу (см)'],
            rows: [
                ['XS', '80-84', '60-64', '58', '60'],
                ['S', '84-88', '64-68', '59', '62'],
                ['M', '88-92', '68-72', '60', '64'],
                ['L', '92-96', '72-76', '61', '66'],
                ['XL', '96-100', '76-80', '62', '68'],
                ['XXL', '100-104', '80-84', '63', '70'],
            ],
        },
        {
            categorySlug: 'svetry',
            columns: ['Розмір', 'Груди (см)', 'Довжина рукава (см)', 'Довжина виробу (см)'],
            rows: [
                ['XS', '80-84', '56', '55'],
                ['S', '84-88', '57', '57'],
                ['M', '88-92', '58', '59'],
                ['L', '92-96', '59', '61'],
                ['XL', '96-100', '60', '63'],
                ['XXL', '100-104', '61', '65'],
            ],
        },
        {
            categorySlug: 'shtany',
            columns: ['Розмір', 'Талія (см)', 'Бедра (см)', 'Довжина внутрішнього шва (см)'],
            rows: [
                ['XS', '60-64', '86-90', '76'],
                ['S', '64-68', '90-94', '77'],
                ['M', '68-72', '94-98', '78'],
                ['L', '72-76', '98-102', '79'],
                ['XL', '76-80', '102-106', '80'],
                ['XXL', '80-84', '106-110', '81'],
            ],
        },
        {
            categorySlug: 'sukni',
            columns: ['Розмір', 'Груди (см)', 'Талія (см)', 'Бедра (см)', 'Довжина виробу (см)'],
            rows: [
                ['XS', '80-84', '60-64', '86-90', '85'],
                ['S', '84-88', '64-68', '90-94', '87'],
                ['M', '88-92', '68-72', '94-98', '89'],
                ['L', '92-96', '72-76', '98-102', '91'],
                ['XL', '96-100', '76-80', '102-106', '93'],
            ],
        },
        {
            categorySlug: 'futbolky',
            columns: ['Розмір', 'Груди (см)', 'Довжина виробу (см)'],
            rows: [
                ['XS', '80-84', '58'],
                ['S', '84-88', '60'],
                ['M', '88-92', '62'],
                ['L', '92-96', '64'],
                ['XL', '96-100', '66'],
                ['XXL', '100-104', '68'],
            ],
        },
        {
            categorySlug: 'shoes',
            columns: ['Розмір EU', 'Довжина стопи (см)'],
            rows: [
                ['36', '23.0'],
                ['37', '23.5'],
                ['38', '24.0'],
                ['39', '24.5'],
                ['40', '25.0'],
                ['41', '25.5'],
                ['42', '26.0'],
                ['43', '26.5'],
                ['44', '27.0'],
                ['45', '27.5'],
            ],
        },
        {
            categorySlug: 'krosivky',
            columns: ['Розмір EU', 'Довжина стопи (см)', 'Ширина стопи (см)'],
            rows: [
                ['36', '23.0', '8.5'],
                ['37', '23.5', '8.7'],
                ['38', '24.0', '8.9'],
                ['39', '24.5', '9.1'],
                ['40', '25.0', '9.3'],
                ['41', '25.5', '9.5'],
                ['42', '26.0', '9.7'],
                ['43', '26.5', '9.9'],
                ['44', '27.0', '10.1'],
                ['45', '27.5', '10.3'],
            ],
        },
        {
            categorySlug: 'cherevyky',
            columns: ['Розмір EU', 'Довжина стопи (см)', 'Обхват гомілки (см)'],
            rows: [
                ['36', '23.0', '32'],
                ['37', '23.5', '33'],
                ['38', '24.0', '34'],
                ['39', '24.5', '35'],
                ['40', '25.0', '36'],
                ['41', '25.5', '37'],
            ],
        },
        {
            categorySlug: 'tufli',
            columns: ['Розмір EU', 'Довжина стопи (см)'],
            rows: [
                ['36', '23.0'],
                ['37', '23.5'],
                ['38', '24.0'],
                ['39', '24.5'],
                ['40', '25.0'],
                ['41', '25.5'],
            ],
        },
        {
            categorySlug: 'sandali',
            columns: ['Розмір EU', 'Довжина стопи (см)'],
            rows: [
                ['36', '23.0'],
                ['37', '23.5'],
                ['38', '24.0'],
                ['39', '24.5'],
                ['40', '25.0'],
                ['41', '25.5'],
            ],
        },
    ];

    let count = 0;

    for (const chart of charts) {
        const category = await prisma.category.findUnique({
            where: { slug: chart.categorySlug },
        });

        if (!category) {
            throw new Error(`Category not found for size chart: ${chart.categorySlug}`);
        }

        const existing = await prisma.sizeChart.findUnique({
            where: { categoryId: category.id },
        });

        if (existing) {
            await prisma.sizeChart.update({
                where: { id: existing.id },
                data: { columns: chart.columns, rows: chart.rows },
            });
        } else {
            await prisma.sizeChart.create({
                data: {
                    categoryId: category.id,
                    columns: chart.columns,
                    rows: chart.rows,
                },
            });
        }

        count++;
    }

    console.log(`  ✅ Size charts: ${count}`);
}

type MockFile = {
    key: string;
    fileType: FileType;
    originalName: string;
    mimeType: string;
};

const MOCK_IMAGES: MockFile[] = Array.from({ length: 50 }, (_, i) => ({
    key: `seed/${i + 1}/600/800`,
    fileType: FileType.IMAGE,
    originalName: `product-${i + 1}.jpg`,
    mimeType: 'image/jpeg',
}));
const MOCK_VIDEOS: MockFile[] = Array.from({ length: 15 }, (_, i) => ({
    key: `mock/products/vid-${String(i + 1).padStart(3, '0')}`,
    fileType: FileType.VIDEO,
    originalName: `hover-${i + 1}.mp4`,
    mimeType: 'video/mp4',
}));

const ALL_MOCK_FILES = [...MOCK_IMAGES, ...MOCK_VIDEOS];

async function seedMockFileAssets(): Promise<Map<string, number>> {
    const fileMap = new Map<string, number>();

    for (let i = 0; i < ALL_MOCK_FILES.length; i++) {
        const file = ALL_MOCK_FILES[i];
        const seedN = i + 1;

        const existing = await prisma.fileAsset.findFirst({
            where: { s3Key: file.key },
        });

        if (existing) {
            fileMap.set(file.key, existing.id);
            continue;
        }

        const created = await prisma.fileAsset.create({
            data: {
                fileType: file.fileType,
                originalName: file.originalName,
                mimeType: file.mimeType,
                size: file.fileType === FileType.VIDEO ? 5_000_000 : 500_000,
                s3Key: file.key,
                s3KeyThumb: file.fileType === FileType.IMAGE ? `seed/${seedN}/100/133` : null,
                s3KeyMedium: file.fileType === FileType.IMAGE ? `seed/${seedN}/400/533` : null,
                s3KeyLarge: file.fileType === FileType.IMAGE ? `seed/${seedN}/800/1067` : null,
            },
        });

        fileMap.set(file.key, created.id);
    }

    console.log(`  ✅ FileAssets: ${ALL_MOCK_FILES.length}`);
    return fileMap;
}

type SeedVariant = {
    sku: string;
    sizeName: string;
    sizeType: SizeType;
    colorName: string;
    price?: number;
    stockQty: number;
};

type SeedProduct = {
    name: string;
    slug: string;
    description: string;
    productType: ProductType;
    categorySlug: string;
    brand: string;
    season: string;
    material: string;
    basePrice: number;
    oldPrice?: number;
    purchaseCost: number;
    isNew: boolean;
    isHit: boolean;
    isSeasonal: boolean;
    mediaCount: number;
    hasHoverVideo: boolean;
    variants: SeedVariant[];
};

async function seedTestProducts(fileMap: Map<string, number>): Promise<void> {
    const categories = await prisma.category.findMany({
        where: {
            slug: {
                in: [
                    'kurtky', 'svetry', 'shtany', 'sukni', 'futbolky',
                    'krosivky', 'cherevyky', 'tufli', 'sandali',
                    'sumky', 'remeni', 'sharfy',
                ],
            },
        },
    });

    const sizes = await prisma.size.findMany();
    const colors = await prisma.color.findMany();

    const categoryBySlug = new Map(categories.map((c) => [c.slug, c]));
    const sizeByKey = new Map(sizes.map((s) => [`${s.sizeType}:${s.name}`, s]));
    const colorByName = new Map(colors.map((c) => [c.name, c]));

    let imageIndex = 0;
    let videoIndex = 0;

    const products: SeedProduct[] = [
        {
            name: 'Куртка зимова Nike Air',
            slug: 'nike-air-winter-jacket',
            description: 'Тепла зимова куртка для щоденного використання.',
            productType: ProductType.CLOTHING,
            categorySlug: 'kurtky',
            brand: 'Nike',
            season: 'WINTER',
            material: 'поліестер',
            basePrice: 4200,
            oldPrice: 4800,
            purchaseCost: 1800,
            isNew: true,
            isHit: false,
            isSeasonal: true,
            mediaCount: 4,
            hasHoverVideo: true,
            variants: [
                { sku: 'NK-JKT-001-BLK-M', sizeName: 'M', sizeType: SizeType.CLOTHING, colorName: 'Чорний', stockQty: 8 },
                { sku: 'NK-JKT-001-BLK-L', sizeName: 'L', sizeType: SizeType.CLOTHING, colorName: 'Чорний', stockQty: 2 },
                { sku: 'NK-JKT-001-OLV-XL', sizeName: 'XL', sizeType: SizeType.CLOTHING, colorName: 'Оливковий', stockQty: 0 },
            ],
        },
        {
            name: 'Светр Zara Basic',
            slug: 'zara-basic-sweater',
            description: 'М\'який повсякденний светр.',
            productType: ProductType.CLOTHING,
            categorySlug: 'svetry',
            brand: 'Zara',
            season: 'ALL_SEASON',
            material: 'бавовна',
            basePrice: 1600,
            purchaseCost: 640,
            isNew: false,
            isHit: true,
            isSeasonal: false,
            mediaCount: 3,
            hasHoverVideo: true,
            variants: [
                { sku: 'ZR-SWT-001-BEI-S', sizeName: 'S', sizeType: SizeType.CLOTHING, colorName: 'Бежевий', stockQty: 10 },
                { sku: 'ZR-SWT-001-BEI-M', sizeName: 'M', sizeType: SizeType.CLOTHING, colorName: 'Бежевий', stockQty: 4 },
                { sku: 'ZR-SWT-001-GRY-L', sizeName: 'L', sizeType: SizeType.CLOTHING, colorName: 'Сірий', stockQty: 1 },
            ],
        },
        {
            name: 'Штани Adidas Sport',
            slug: 'adidas-sport-pants',
            description: 'Зручні спортивні штани.',
            productType: ProductType.CLOTHING,
            categorySlug: 'shtany',
            brand: 'Adidas',
            season: 'SPRING',
            material: 'поліестер',
            basePrice: 1900,
            purchaseCost: 760,
            isNew: false,
            isHit: false,
            isSeasonal: false,
            mediaCount: 2,
            hasHoverVideo: false,
            variants: [
                { sku: 'AD-PNT-001-NVY-M', sizeName: 'M', sizeType: SizeType.CLOTHING, colorName: 'Темно-синій', stockQty: 6 },
                { sku: 'AD-PNT-001-NVY-L', sizeName: 'L', sizeType: SizeType.CLOTHING, colorName: 'Темно-синій', stockQty: 3 },
                { sku: 'AD-PNT-001-BLK-XL', sizeName: 'XL', sizeType: SizeType.CLOTHING, colorName: 'Чорний', stockQty: 0 },
            ],
        },
        {
            name: 'Сукня H&M Summer',
            slug: 'hm-summer-dress',
            description: 'Легка літня сукня.',
            productType: ProductType.CLOTHING,
            categorySlug: 'sukni',
            brand: 'H&M',
            season: 'SUMMER',
            material: 'бавовна',
            basePrice: 1450,
            oldPrice: 1750,
            purchaseCost: 580,
            isNew: true,
            isHit: false,
            isSeasonal: true,
            mediaCount: 3,
            hasHoverVideo: true,
            variants: [
                { sku: 'HM-DRS-001-PNK-S', sizeName: 'S', sizeType: SizeType.CLOTHING, colorName: 'Рожевий', stockQty: 7 },
                { sku: 'HM-DRS-001-PNK-M', sizeName: 'M', sizeType: SizeType.CLOTHING, colorName: 'Рожевий', stockQty: 2 },
                { sku: 'HM-DRS-001-RED-L', sizeName: 'L', sizeType: SizeType.CLOTHING, colorName: 'Червоний', stockQty: 0 },
            ],
        },
        {
            name: 'Футболка Puma Urban',
            slug: 'puma-urban-tshirt',
            description: 'Базова футболка в міському стилі.',
            productType: ProductType.CLOTHING,
            categorySlug: 'futbolky',
            brand: 'Puma',
            season: 'SUMMER',
            material: 'бавовна',
            basePrice: 990,
            purchaseCost: 396,
            isNew: false,
            isHit: true,
            isSeasonal: false,
            mediaCount: 2,
            hasHoverVideo: false,
            variants: [
                { sku: 'PM-TSH-001-WHT-S', sizeName: 'S', sizeType: SizeType.CLOTHING, colorName: 'Білий', stockQty: 12 },
                { sku: 'PM-TSH-001-WHT-M', sizeName: 'M', sizeType: SizeType.CLOTHING, colorName: 'Білий', stockQty: 5 },
                { sku: 'PM-TSH-001-BLK-L', sizeName: 'L', sizeType: SizeType.CLOTHING, colorName: 'Чорний', stockQty: 2 },
            ],
        },
        {
            name: 'Куртка H&M Denim',
            slug: 'hm-denim-jacket',
            description: 'Демісезонна джинсова куртка.',
            productType: ProductType.CLOTHING,
            categorySlug: 'kurtky',
            brand: 'H&M',
            season: 'SPRING',
            material: 'бавовна',
            basePrice: 2300,
            purchaseCost: 920,
            isNew: false,
            isHit: false,
            isSeasonal: false,
            mediaCount: 3,
            hasHoverVideo: true,
            variants: [
                { sku: 'HM-JKT-002-BLU-M', sizeName: 'M', sizeType: SizeType.CLOTHING, colorName: 'Синій', stockQty: 4 },
                { sku: 'HM-JKT-002-BLU-L', sizeName: 'L', sizeType: SizeType.CLOTHING, colorName: 'Синій', stockQty: 1 },
            ],
        },
        {
            name: 'Светр Nike Club',
            slug: 'nike-club-sweater',
            description: 'Теплий светр для прохолодної погоди.',
            productType: ProductType.CLOTHING,
            categorySlug: 'svetry',
            brand: 'Nike',
            season: 'WINTER',
            material: 'бавовна',
            basePrice: 2100,
            purchaseCost: 840,
            isNew: true,
            isHit: false,
            isSeasonal: false,
            mediaCount: 2,
            hasHoverVideo: false,
            variants: [
                { sku: 'NK-SWT-002-GRY-M', sizeName: 'M', sizeType: SizeType.CLOTHING, colorName: 'Сірий', stockQty: 9 },
                { sku: 'NK-SWT-002-GRY-L', sizeName: 'L', sizeType: SizeType.CLOTHING, colorName: 'Сірий', stockQty: 0 },
            ],
        },
        {
            name: 'Кросівки Nike Run',
            slug: 'nike-run-sneakers',
            description: 'Легкі бігові кросівки.',
            productType: ProductType.SHOES,
            categorySlug: 'krosivky',
            brand: 'Nike',
            season: 'ALL_SEASON',
            material: 'нейлон',
            basePrice: 3400,
            oldPrice: 3900,
            purchaseCost: 1500,
            isNew: false,
            isHit: true,
            isSeasonal: false,
            mediaCount: 4,
            hasHoverVideo: true,
            variants: [
                { sku: 'NK-SNK-001-WHT-40', sizeName: '40', sizeType: SizeType.SHOES, colorName: 'Білий', stockQty: 6 },
                { sku: 'NK-SNK-001-WHT-41', sizeName: '41', sizeType: SizeType.SHOES, colorName: 'Білий', stockQty: 2 },
                { sku: 'NK-SNK-001-BLK-42', sizeName: '42', sizeType: SizeType.SHOES, colorName: 'Чорний', stockQty: 0 },
            ],
        },
        {
            name: 'Черевики Zara Leather',
            slug: 'zara-leather-boots',
            description: 'Шкіряні черевики для осені.',
            productType: ProductType.SHOES,
            categorySlug: 'cherevyky',
            brand: 'Zara',
            season: 'WINTER',
            material: 'шкіра',
            basePrice: 4100,
            purchaseCost: 1900,
            isNew: false,
            isHit: false,
            isSeasonal: false,
            mediaCount: 3,
            hasHoverVideo: true,
            variants: [
                { sku: 'ZR-BTS-001-BRN-39', sizeName: '39', sizeType: SizeType.SHOES, colorName: 'Коричневий', stockQty: 3 },
                { sku: 'ZR-BTS-001-BRN-40', sizeName: '40', sizeType: SizeType.SHOES, colorName: 'Коричневий', stockQty: 1 },
                { sku: 'ZR-BTS-001-BLK-41', sizeName: '41', sizeType: SizeType.SHOES, colorName: 'Чорний', stockQty: 0 },
            ],
        },
        {
            name: 'Туфлі H&M Classic',
            slug: 'hm-classic-shoes',
            description: 'Класичні туфлі на кожен день.',
            productType: ProductType.SHOES,
            categorySlug: 'tufli',
            brand: 'H&M',
            season: 'ALL_SEASON',
            material: 'замша',
            basePrice: 2700,
            purchaseCost: 1100,
            isNew: false,
            isHit: false,
            isSeasonal: false,
            mediaCount: 2,
            hasHoverVideo: false,
            variants: [
                { sku: 'HM-SHO-001-BEI-37', sizeName: '37', sizeType: SizeType.SHOES, colorName: 'Бежевий', stockQty: 5 },
                { sku: 'HM-SHO-001-BEI-38', sizeName: '38', sizeType: SizeType.SHOES, colorName: 'Бежевий', stockQty: 2 },
            ],
        },
        {
            name: 'Сандалі Puma Beach',
            slug: 'puma-beach-sandals',
            description: 'Літні сандалі для відпочинку.',
            productType: ProductType.SHOES,
            categorySlug: 'sandali',
            brand: 'Puma',
            season: 'SUMMER',
            material: 'поліестер',
            basePrice: 1800,
            purchaseCost: 720,
            isNew: false,
            isHit: false,
            isSeasonal: false,
            mediaCount: 2,
            hasHoverVideo: false,
            variants: [
                { sku: 'PM-SDL-001-YLW-38', sizeName: '38', sizeType: SizeType.SHOES, colorName: 'Жовтий', stockQty: 8 },
                { sku: 'PM-SDL-001-YLW-39', sizeName: '39', sizeType: SizeType.SHOES, colorName: 'Жовтий', stockQty: 2 },
                { sku: 'PM-SDL-001-ORG-40', sizeName: '40', sizeType: SizeType.SHOES, colorName: 'Помаранчевий', stockQty: 0 },
            ],
        },
        {
            name: 'Кросівки Adidas Street',
            slug: 'adidas-street-sneakers',
            description: 'Міські кросівки для щоденного носіння.',
            productType: ProductType.SHOES,
            categorySlug: 'krosivky',
            brand: 'Adidas',
            season: 'SPRING',
            material: 'нейлон',
            basePrice: 3200,
            purchaseCost: 1400,
            isNew: false,
            isHit: false,
            isSeasonal: false,
            mediaCount: 3,
            hasHoverVideo: true,
            variants: [
                { sku: 'AD-SNK-002-GRN-41', sizeName: '41', sizeType: SizeType.SHOES, colorName: 'Зелений', stockQty: 4 },
                { sku: 'AD-SNK-002-GRN-42', sizeName: '42', sizeType: SizeType.SHOES, colorName: 'Зелений', stockQty: 1 },
                { sku: 'AD-SNK-002-WHT-43', sizeName: '43', sizeType: SizeType.SHOES, colorName: 'Білий', stockQty: 0 },
            ],
        },
        {
            name: 'Сумка Zara City',
            slug: 'zara-city-bag',
            description: 'Містка сумка для міста.',
            productType: ProductType.ACCESSORY,
            categorySlug: 'sumky',
            brand: 'Zara',
            season: 'ALL_SEASON',
            material: 'шкіра',
            basePrice: 2500,
            purchaseCost: 1000,
            isNew: false,
            isHit: false,
            isSeasonal: false,
            mediaCount: 3,
            hasHoverVideo: true,
            variants: [
                { sku: 'ZR-BAG-001-BLK-OS', sizeName: 'ONE_SIZE', sizeType: SizeType.ACCESSORY, colorName: 'Чорний', stockQty: 6 },
                { sku: 'ZR-BAG-001-BEI-OS', sizeName: 'ONE_SIZE', sizeType: SizeType.ACCESSORY, colorName: 'Бежевий', stockQty: 2 },
            ],
        },
        {
            name: 'Ремінь H&M Leather',
            slug: 'hm-leather-belt',
            description: 'Класичний шкіряний ремінь.',
            productType: ProductType.ACCESSORY,
            categorySlug: 'remeni',
            brand: 'H&M',
            season: 'ALL_SEASON',
            material: 'шкіра',
            basePrice: 850,
            purchaseCost: 340,
            isNew: false,
            isHit: false,
            isSeasonal: false,
            mediaCount: 2,
            hasHoverVideo: false,
            variants: [
                { sku: 'HM-BLT-001-BRN-OS', sizeName: 'ONE_SIZE', sizeType: SizeType.ACCESSORY, colorName: 'Коричневий', stockQty: 9 },
                { sku: 'HM-BLT-001-BLK-OS', sizeName: 'ONE_SIZE', sizeType: SizeType.ACCESSORY, colorName: 'Чорний', stockQty: 0 },
            ],
        },
        {
            name: 'Шарф Nike Winter',
            slug: 'nike-winter-scarf',
            description: 'Теплий шарф для холодної пори року.',
            productType: ProductType.ACCESSORY,
            categorySlug: 'sharfy',
            brand: 'Nike',
            season: 'WINTER',
            material: 'бавовна',
            basePrice: 1100,
            purchaseCost: 440,
            isNew: false,
            isHit: false,
            isSeasonal: false,
            mediaCount: 2,
            hasHoverVideo: false,
            variants: [
                { sku: 'NK-SCF-001-BRD-OS', sizeName: 'ONE_SIZE', sizeType: SizeType.ACCESSORY, colorName: 'Бордовий', stockQty: 5 },
                { sku: 'NK-SCF-001-GRY-OS', sizeName: 'ONE_SIZE', sizeType: SizeType.ACCESSORY, colorName: 'Сірий', stockQty: 1 },
            ],
        },
    ];

    for (const product of products) {
        const category = categoryBySlug.get(product.categorySlug);

        if (!category) {
            throw new Error(`Category not found: ${product.categorySlug}`);
        }

        let hoverVideoFileId: number | null = null;

        if (product.hasHoverVideo) {
            const videoKey = MOCK_VIDEOS[videoIndex % MOCK_VIDEOS.length].key;
            hoverVideoFileId = fileMap.get(videoKey) ?? null;
            videoIndex++;
        }

        const existingProduct = await prisma.product.findUnique({
            where: { slug: product.slug },
        });

        const savedProduct = existingProduct
            ? await prisma.product.update({
                where: { id: existingProduct.id },
                data: {
                    name: product.name,
                    description: product.description,
                    productType: product.productType,
                    categoryId: category.id,
                    brand: product.brand,
                    season: product.season,
                    material: product.material,
                    basePrice: product.basePrice,
                    oldPrice: product.oldPrice ?? null,
                    purchaseCost: product.purchaseCost,
                    isActive: true,
                    isNew: product.isNew,
                    isHit: product.isHit,
                    isSeasonal: product.isSeasonal,
                    hoverVideoFileId,
                    deletedAt: null,
                },
            })
            : await prisma.product.create({
                data: {
                    name: product.name,
                    slug: product.slug,
                    description: product.description,
                    productType: product.productType,
                    categoryId: category.id,
                    brand: product.brand,
                    season: product.season,
                    material: product.material,
                    basePrice: product.basePrice,
                    oldPrice: product.oldPrice ?? null,
                    purchaseCost: product.purchaseCost,
                    isActive: true,
                    isNew: product.isNew,
                    isHit: product.isHit,
                    isSeasonal: product.isSeasonal,
                    hoverVideoFileId,
                },
            });

        for (const variant of product.variants) {
            const size = sizeByKey.get(`${variant.sizeType}:${variant.sizeName}`);
            const color = colorByName.get(variant.colorName);

            if (!size) {
                throw new Error(`Size not found: ${variant.sizeType}:${variant.sizeName}`);
            }

            if (!color) {
                throw new Error(`Color not found: ${variant.colorName}`);
            }

            await prisma.productVariant.upsert({
                where: { sku: variant.sku },
                update: {
                    productId: savedProduct.id,
                    sizeId: size.id,
                    colorId: color.id,
                    price: variant.price ?? null,
                    stockQty: variant.stockQty,
                    reservedQty: 0,
                    isActive: true,
                    deletedAt: null,
                },
                create: {
                    productId: savedProduct.id,
                    sku: variant.sku,
                    sizeId: size.id,
                    colorId: color.id,
                    price: variant.price ?? null,
                    stockQty: variant.stockQty,
                    reservedQty: 0,
                    isActive: true,
                },
            });
        }

        await prisma.productMedia.deleteMany({
            where: { productId: savedProduct.id },
        });

        for (let i = 0; i < product.mediaCount; i++) {
            const imgKey = MOCK_IMAGES[imageIndex % MOCK_IMAGES.length].key;
            const fileId = fileMap.get(imgKey);
            imageIndex++;

            if (!fileId) continue;

            await prisma.productMedia.create({
                data: {
                    productId: savedProduct.id,
                    fileId,
                    mediaType: MediaType.IMAGE,
                    isMain: i === 0,
                    sortOrder: i,
                },
            });
        }

        if (product.hasHoverVideo && hoverVideoFileId) {
            await prisma.productMedia.create({
                data: {
                    productId: savedProduct.id,
                    fileId: hoverVideoFileId,
                    mediaType: MediaType.VIDEO,
                    isMain: false,
                    sortOrder: product.mediaCount,
                },
            });
        }
    }

    console.log(`  ✅ Test products: ${products.length} (with media & hover videos)`);
}

async function main(): Promise<void> {
    console.log('🌱 Starting seed...');

    await seedAdmin();
    await seedSizes();
    await seedColors();
    await seedCategories();
    await seedSettings();
    await seedPages();
    await seedSizeCharts();
    const fileMap = await seedMockFileAssets();
    await seedTestProducts(fileMap);

    console.log('✅ Seed completed');
}

main()
    .catch((error: unknown) => {
        console.error('❌ Seed failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
