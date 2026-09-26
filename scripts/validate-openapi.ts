import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type OpenApiMethod = {
  tags?: string[];
  security?: Array<Record<string, string[]>>;
};

type OpenApiDocument = {
  openapi?: string;
  paths?: Record<string, Record<string, OpenApiMethod>>;
  components?: {
    schemas?: Record<string, unknown>;
  };
};

const publicRoutes = new Set<string>([
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/forgot-password',
  'POST /auth/reset-password',
  'GET /auth/google',
  'GET /auth/google/callback',
  'GET /storefront/categories',
  'GET /storefront/categories/{categoryId}/size-chart',
  'GET /storefront/products',
  'GET /storefront/products/{slug}',
  'GET /storefront/products/{slug}/related',
  'GET /storefront/products/{productId}/reviews',
  'GET /storefront/hero-slides',
  'GET /storefront/promo-blocks',
  'GET /storefront/pages/{slug}',
  'POST /storefront/feedback',
  'GET /storefront/settings',
  'GET /delivery/cities',
  'GET /delivery/warehouses',
  'GET /health',
]);

function hasSecurity(method: OpenApiMethod | undefined): boolean {
  if (!method?.security) {
    return false;
  }

  return Array.isArray(method.security) && method.security.length > 0;
}

function main(): void {
  const documentPath = join(process.cwd(), 'docs', 'openapi.json');
  const rawDocument = readFileSync(documentPath, 'utf-8');
  const document = JSON.parse(rawDocument) as OpenApiDocument;

  if (!document.openapi) {
    throw new Error('OpenAPI version is missing');
  }

  if (!document.paths || Object.keys(document.paths).length === 0) {
    throw new Error('OpenAPI paths are missing');
  }

  const routeEntries = Object.entries(document.paths);

  const routeCount = routeEntries.reduce((count, [, methods]) => {
    return count + Object.keys(methods).length;
  }, 0);

  const missingTags = routeEntries.flatMap(([pathName, methods]) =>
    Object.entries(methods).flatMap(([methodName, methodConfig]) => {
      const hasMethodTags =
        Array.isArray(methodConfig?.tags) && methodConfig.tags.length > 0;

      return hasMethodTags ? [] : [`${methodName.toUpperCase()} ${pathName}`];
    }),
  );

  if (missingTags.length > 0) {
    throw new Error(`Routes without tags:\n${missingTags.join('\n')}`);
  }

  const missingSecurity = routeEntries.flatMap(([pathName, methods]) =>
    Object.entries(methods).flatMap(([methodName, methodConfig]) => {
      const routeKey = `${methodName.toUpperCase()} ${pathName}`;

      if (publicRoutes.has(routeKey)) {
        return [];
      }

      return hasSecurity(methodConfig) ? [] : [routeKey];
    }),
  );

  if (missingSecurity.length > 0) {
    throw new Error(
      `Protected routes without security:\n${missingSecurity.join('\n')}`,
    );
  }

  const schemaCount = Object.keys(document.components?.schemas ?? {}).length;

  process.stdout.write(
    [
      `OpenAPI version: ${document.openapi}`,
      `Paths: ${Object.keys(document.paths).length}`,
      `Operations: ${routeCount}`,
      `Schemas: ${schemaCount}`,
      'Validation: OK',
    ].join('\n'),
  );
}

main();
