import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';

const httpMethods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

function isProtectedRoute(path: string): boolean {
  if (path === '/auth/logout') {
    return true;
  }

  if (path.startsWith('/admin/')) {
    return true;
  }

  if (path.startsWith('/users/me')) {
    return true;
  }

  if (path.startsWith('/storefront/account')) {
    return true;
  }

  if (path.startsWith('/storefront/favorites')) {
    return true;
  }

  if (path === '/storefront/orders') {
    return true;
  }

  if (path === '/storefront/cart' || path.startsWith('/storefront/cart/')) {
    return true;
  }

  if (/^\/storefront\/products\/[^/]+\/reviews$/.test(path)) {
    return true;
  }

  return false;
}

function applySecurity(document: OpenAPIObject): OpenAPIObject {
  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (!pathItem || !isProtectedRoute(path)) {
      continue;
    }

    for (const method of httpMethods) {
      const operation = pathItem[method];

      if (!operation) {
        continue;
      }

      operation.security = [{ bearer: [] }];
    }
  }

  return document;
}

async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });

  const documentConfig = new DocumentBuilder()
    .setTitle('Shop API')
    .setDescription('API documentation for shop backend')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
      },
      'bearer',
    )
    .addCookieAuth('refreshToken', {
      type: 'apiKey',
      in: 'cookie',
      name: 'refreshToken',
    })
    .build();

  const document = SwaggerModule.createDocument(app, documentConfig);
  const securedDocument = applySecurity(document);

  mkdirSync(join(process.cwd(), 'docs'), { recursive: true });
  writeFileSync(
    join(process.cwd(), 'docs', 'openapi.json'),
    JSON.stringify(securedDocument, null, 2),
    'utf-8',
  );

  await app.close();
}

generate();
