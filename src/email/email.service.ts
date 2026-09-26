import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, ReturnStatus } from '@prisma/client';
import { Resend } from 'resend';

const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: 'Нове',
  PROCESSING: 'В обробці',
  SHIPPED: 'Відправлено',
  DELIVERED: 'Доставлено',
  CANCELLED: 'Скасовано',
  RETURNED: 'Повернено',
};

const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  NEW: 'Нова',
  UNDER_REVIEW: 'На розгляді',
  APPROVED: 'Схвалено — чекаємо посилку',
  RECEIVED: 'Отримано на складі',
  REFUNDED: 'Гроші повернено',
  REJECTED: 'Відхилено',
  CANCELLED: 'Скасовано',
};

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly fromEmail: string;
  private readonly frontendUrl: string;
  private readonly enabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY') ?? '';
    this.enabled = apiKey.trim().length > 0;
    this.resend = new Resend(apiKey || 're_placeholder');
    this.fromEmail = this.configService.getOrThrow<string>('RESEND_FROM_EMAIL');
    this.frontendUrl = this.configService.getOrThrow<string>('FRONTEND_URL');
  }

  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;

    await this.resend.emails.send({
      from: this.fromEmail,
      to: email,
      subject: 'Скидання пароля',
      html: `
        <h2>Скидання пароля</h2>
        <p>Ви отримали цей лист, тому що надіслали запит на скидання пароля.</p>
        <p><a href="${resetUrl}">Натисніть тут, щоб скинути пароль</a></p>
        <p>Посилання дійсне протягом 1 години.</p>
        <p>Якщо ви не надсилали цей запит, просто проігноруйте цей лист.</p>
      `,
    });
  }

  /**
   * Транзакционные письма по заказу. Не-фатальные: любые ошибки (нет ключа,
   * сбой Resend) логируются и глотаются, чтобы не рушить оформление заказа.
   */
  async sendOrderConfirmationEmail(params: {
    email: string;
    orderNumber: string;
    totalAmount: number;
    currency: string;
  }): Promise<void> {
    await this.deliver(params.email, `Замовлення ${params.orderNumber} прийнято`, `
      <h2>Дякуємо за замовлення!</h2>
      <p>Замовлення <b>${params.orderNumber}</b> прийнято в обробку.</p>
      <p>Сума до сплати: <b>${params.totalAmount} ${params.currency}</b>.</p>
      <p>Ми повідомимо вас про зміну статусу.</p>
    `);
  }

  async sendNewsletterConfirmEmail(params: { email: string; token: string }): Promise<void> {
    const url = `${this.frontendUrl.replace(/\/$/, '')}/newsletter/confirm?token=${params.token}`;
    await this.deliver(params.email, 'Підтвердіть підписку на розсилку', `
      <h2>Підтвердження підписки</h2>
      <p>Натисніть, щоб підтвердити підписку на новини та акції:</p>
      <p><a href="${url}">Підтвердити підписку</a></p>
      <p>Якщо ви не підписувалися — просто проігноруйте цей лист.</p>
    `);
  }

  async sendBackInStockEmail(params: {
    email: string;
    productName: string;
    slug: string;
  }): Promise<void> {
    const url = `${this.frontendUrl.replace(/\/$/, '')}/product/${params.slug}`;
    await this.deliver(params.email, `${params.productName} — знову в наявності`, `
      <h2>Товар знову в наявності</h2>
      <p><b>${params.productName}</b> знову доступний до замовлення.</p>
      <p><a href="${url}">Перейти до товару</a></p>
    `);
  }

  async sendOrderStatusEmail(params: {
    email: string;
    orderNumber: string;
    newStatus: OrderStatus;
  }): Promise<void> {
    const label = ORDER_STATUS_LABELS[params.newStatus];
    await this.deliver(params.email, `Замовлення ${params.orderNumber}: ${label}`, `
      <h2>Статус замовлення оновлено</h2>
      <p>Замовлення <b>${params.orderNumber}</b> тепер має статус: <b>${label}</b>.</p>
    `);
  }

  async sendReturnCreatedEmail(params: {
    email: string;
    returnNumber: string;
    orderNumber: string;
  }): Promise<void> {
    await this.deliver(params.email, `Заявку на повернення ${params.returnNumber} створено`, `
      <h2>Заявку на повернення отримано</h2>
      <p>Заявка <b>${params.returnNumber}</b> за замовленням <b>${params.orderNumber}</b> прийнята.</p>
      <p>Ми розглянемо її найближчим часом і повідомимо про рішення.</p>
    `);
  }

  async sendReturnStatusEmail(params: {
    email: string;
    returnNumber: string;
    newStatus: ReturnStatus;
    comment?: string | null;
  }): Promise<void> {
    const label = RETURN_STATUS_LABELS[params.newStatus];
    const note = params.comment ? `<p>${escapeHtml(params.comment)}</p>` : '';
    await this.deliver(params.email, `Повернення ${params.returnNumber}: ${label}`, `
      <h2>Статус повернення оновлено</h2>
      <p>Заявка <b>${params.returnNumber}</b> тепер має статус: <b>${label}</b>.</p>
      ${note}
    `);
  }

  private async deliver(to: string, subject: string, html: string): Promise<void> {
    if (!this.enabled) {
      this.logger.warn(`Email skipped (RESEND_API_KEY not set): "${subject}" -> ${to}`);
      return;
    }
    try {
      await this.resend.emails.send({ from: this.fromEmail, to, subject, html });
    } catch (error) {
      this.logger.error(`Failed to send "${subject}" to ${to}`, error as Error);
    }
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
