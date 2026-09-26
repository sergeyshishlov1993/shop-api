import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** Populates req.user when a valid Bearer token is present; never throws. */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser>(_err: unknown, user: TUser): TUser {
    return (user || undefined) as TUser;
  }
}
