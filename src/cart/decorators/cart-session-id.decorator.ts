import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const CartSessionId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | null => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const value = request.cookies?.cartSessionId;

    return typeof value === 'string' && value.length > 0 ? value : null;
  },
);
