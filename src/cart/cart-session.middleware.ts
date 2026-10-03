import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class CartSessionMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const existingSessionId = req.cookies?.cartSessionId;

    if (typeof existingSessionId === 'string' && existingSessionId.length > 0) {
      return next();
    }

    const sessionId = randomUUID();

    res.cookie('cartSessionId', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 24 * 30,
      path: '/',
    });

    req.cookies = {
      ...(req.cookies ?? {}),
      cartSessionId: sessionId,
    };

    next();
  }
}
