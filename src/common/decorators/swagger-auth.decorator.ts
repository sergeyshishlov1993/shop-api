import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

export function SwaggerJwtAuth() {
  return applyDecorators(
    ApiBearerAuth('bearer'),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );
}
