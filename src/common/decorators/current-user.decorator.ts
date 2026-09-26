import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export interface RequestUser {
  id: number;
  email: string;
  role: UserRole;
}

export const CurrentUser = createParamDecorator(
  (data: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const { user } = ctx.switchToHttp().getRequest<{ user: RequestUser }>();
    return data ? user?.[data] : user;
  },
);
