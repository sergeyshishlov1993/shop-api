import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { NewsletterStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class NewsletterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  async subscribe(email: string, source?: string): Promise<{ status: 'pending' | 'already_confirmed' }> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.newsletterSubscriber.findUnique({ where: { email: normalized } });

    if (existing?.status === NewsletterStatus.CONFIRMED) {
      return { status: 'already_confirmed' };
    }

    const token = randomUUID();
    if (existing) {
      await this.prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: { status: NewsletterStatus.PENDING, token, unsubscribedAt: null, source: source ?? existing.source },
      });
    } else {
      await this.prisma.newsletterSubscriber.create({
        data: { email: normalized, token, source },
      });
    }

    await this.emailService.sendNewsletterConfirmEmail({ email: normalized, token });
    return { status: 'pending' };
  }

  async confirm(token: string): Promise<{ confirmed: true }> {
    const sub = await this.prisma.newsletterSubscriber.findUnique({ where: { token } });
    if (!sub) throw new BadRequestException('Недійсний токен підтвердження.');
    if (sub.status !== NewsletterStatus.CONFIRMED) {
      await this.prisma.newsletterSubscriber.update({
        where: { id: sub.id },
        data: { status: NewsletterStatus.CONFIRMED, confirmedAt: new Date() },
      });
    }
    return { confirmed: true };
  }

  async unsubscribe(token: string): Promise<{ unsubscribed: true }> {
    const sub = await this.prisma.newsletterSubscriber.findUnique({ where: { token } });
    if (!sub) throw new BadRequestException('Недійсний токен.');
    await this.prisma.newsletterSubscriber.update({
      where: { id: sub.id },
      data: { status: NewsletterStatus.UNSUBSCRIBED, unsubscribedAt: new Date() },
    });
    return { unsubscribed: true };
  }
}
