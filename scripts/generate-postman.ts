import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import openapiToPostman from 'openapi-to-postmanv2';

type ConversionResult = {
  result: boolean;
  reason?: string;
  output?: Array<{
    type: string;
    data: unknown;
  }>;
};

const convert = promisify(openapiToPostman.convert);

async function main(): Promise<void> {
  const inputPath = join(process.cwd(), 'docs', 'openapi.json');
  const outputDirectory = join(process.cwd(), 'docs', 'postman');
  const outputPath = join(outputDirectory, 'shop-api.postman_collection.json');

  const openApiDocument = readFileSync(inputPath, 'utf-8');

  const conversionResult = (await convert(
    { type: 'string', data: openApiDocument },
    {
      folderStrategy: 'Tags',
      includeAuthInfoInExample: true,
      requestNameSource: 'Fallback',
    },
  )) as ConversionResult;

  if (!conversionResult.result || !conversionResult.output?.length) {
    throw new Error(conversionResult.reason ?? 'Postman conversion failed');
  }

  const collection = conversionResult.output.find(
    (entry) => entry.type === 'collection',
  );

  if (!collection) {
    throw new Error('Postman collection output is missing');
  }

  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(collection.data, null, 2), 'utf-8');
}

main();
