import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication, prefix: string): void {
    const description = `
# Документация API интернет-магазина

API разделено на функциональные зоны:

- Auth — регистрация, вход, обновление токенов, выход, восстановление пароля
- Account — личный кабинет пользователя
- Admin — управление каталогом, заказами, контентом, файлами и настройками
- Storefront — публичные и клиентские методы витрины
- System — служебные методы приложения

## Авторизация

### Access token
Передается в заголовке:

\`Authorization: Bearer <token>\`

### Refresh token
Хранится в httpOnly cookie:

\`refreshToken\`

Используется в методах обновления сессии.

## Роли доступа

- Публичный метод — доступен без авторизации
- Авторизованный пользователь — нужен JWT access token
- Только ADMIN — доступен только администратору
`;

    const config = new DocumentBuilder()
        .setTitle('API интернет-магазина')
        .setDescription(description)
        .setVersion('1.0.0')
        .addBearerAuth(
            {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
                in: 'header',
                description: 'JWT access token. Передавайте в формате: Bearer <token>',
            },
            'bearer',
        )
        .addCookieAuth('refreshToken', {
            type: 'apiKey',
            in: 'cookie',
            name: 'refreshToken',
            description: 'HttpOnly cookie с refresh token для обновления сессии',
        })
        .build();

    const document = SwaggerModule.createDocument(app, config, {
        operationIdFactory: (_controllerKey: string, methodKey: string) => methodKey,
    });

    SwaggerModule.setup(`${prefix}/docs`, app, document, {
        jsonDocumentUrl: `${prefix}/docs-json`,
        customSiteTitle: 'Документация API интернет-магазина',
        swaggerOptions: {
            persistAuthorization: true,
            displayRequestDuration: true,
            docExpansion: 'none',
            filter: true,
            tagsSorter: 'alpha',
            operationsSorter: 'alpha',
            defaultModelsExpandDepth: -1,
            defaultModelExpandDepth: 1,
        },
    });
}