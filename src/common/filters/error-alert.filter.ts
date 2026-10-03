import { ArgumentsHost, Catch, HttpException, HttpStatus } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { BaseExceptionFilter } from '@nestjs/core';
import { Request } from 'express';
import { TelegramService } from '../../notification/telegram.service';

const DEDUPE_MS = 5 * 60 * 1000;

// Шлёт 5xx в Telegram; одинаковая ошибка — не чаще раза в 5 минут.
// ponytail: дедуп в памяти процесса — при нескольких инстансах перенести в Redis.
export class ErrorAlerter {
  private readonly lastSent = new Map<string, number>();

  constructor(private readonly telegram: TelegramService) {}

  alert(title: string, error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    const key = `${title}|${err.message}`;
    const now = Date.now();
    if (now - (this.lastSent.get(key) ?? 0) < DEDUPE_MS) return;
    this.lastSent.set(key, now);
    if (this.lastSent.size > 500) this.lastSent.clear();

    const stack = (err.stack ?? err.message).split('\n').slice(0, 8).join('\n');
    void this.telegram.sendErrorAlert({ title, details: stack });
  }
}

@Catch()
export class ErrorAlertFilter extends BaseExceptionFilter {
  constructor(private readonly alerter: ErrorAlerter, adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status >= 500 && host.getType() === 'http') {
      const req = host.switchToHttp().getRequest<Request & { user?: { id?: number } }>();
      const route = (req.route as { path?: string } | undefined)?.path ?? req.path;
      const user = req.user?.id ? ` user=${req.user.id}` : '';
      this.alerter.alert(`${status} ${req.method} ${route}${user}`, exception);
    }
    super.catch(exception, host);
  }
}
