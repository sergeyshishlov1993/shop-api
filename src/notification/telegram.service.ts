import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private async sendMessage(
    text: string,
    enabledField?: 'notifyOnNewOrder' | 'notifyOnNewReview' | 'notifyOnNewFeedback' | 'notifyOnLowStock',
  ): Promise<void> {
    try {
      const settings = await this.prisma.storeSettings.findUnique({ where: { id: 1 } });
      if (enabledField && settings && !settings[enabledField]) return;

      const token = settings?.telegramBotToken || this.configService.get<string>('TELEGRAM_BOT_TOKEN');

      if (!token) {
        this.logger.warn('TELEGRAM_BOT_TOKEN is not configured');
        return;
      }

      const chatId =
        settings?.telegramAdminChatId ||
        this.configService.get<string>('TELEGRAM_ADMIN_CHAT_ID');

      if (!chatId) {
        this.logger.warn('Telegram chat id is not configured');
        return;
      }

      await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
      });
    } catch (error) {
      this.logger.error('Failed to send Telegram message', error);
    }
  }

  async sendOrderNotification(data: {
    orderNumber: string;
    amount: number;
    client: string;
    phone: string;
    delivery: string;
    adminLink: string;
  }): Promise<void> {
    const orderNumber = this.escapeHtml(data.orderNumber);
    const amount = this.escapeHtml(String(data.amount));
    const client = this.escapeHtml(data.client);
    const phone = this.escapeHtml(data.phone);
    const delivery = this.escapeHtml(data.delivery);
    const adminLink = this.escapeHtml(data.adminLink);

    const text = `
📦 <b>Нове замовлення: ${orderNumber}</b>
💰 Сума: ${amount}
👤 Клієнт: ${client}
📞 Телефон: ${phone}
🚚 Доставка: ${delivery}

🔗 <a href="${adminLink}">Відкрити в адмінці</a>
    `.trim();

    await this.sendMessage(text, 'notifyOnNewOrder');
  }

  async sendNewReviewNotification(data: {
    productName: string;
    rating: number;
    text: string;
  }): Promise<void> {
    const productName = this.escapeHtml(data.productName);
    const rating = this.escapeHtml(String(data.rating));
    const reviewText = this.escapeHtml(data.text);

    const text = `
⭐ <b>Новий відгук</b>
🛍 Товар: ${productName}
Оцінка: ${rating}/5
📝 Текст:
<i>${reviewText}</i>
    `.trim();

    await this.sendMessage(text, 'notifyOnNewReview');
  }

  async sendFeedbackNotification(data: {
    name: string;
    phone?: string;
    email?: string;
    message: string;
  }): Promise<void> {
    const name = this.escapeHtml(data.name);
    const phone = this.escapeHtml(data.phone || '-');
    const email = this.escapeHtml(data.email || '-');
    const message = this.escapeHtml(data.message);

    const text = `
📩 <b>Нове повідомлення (Зворотний зв'язок)</b>
👤 Ім'я: ${name}
📞 Телефон: ${phone}
📧 Email: ${email}
📝 Повідомлення:
<i>${message}</i>
    `.trim();

    await this.sendMessage(text, 'notifyOnNewFeedback');
  }

  async sendLowStockNotification(data: {
    productName: string;
    sku: string;
    size?: string;
    color?: string;
    stock: number;
  }): Promise<void> {
    const productName = this.escapeHtml(data.productName);
    const sku = this.escapeHtml(data.sku);
    const size = this.escapeHtml(data.size || '-');
    const color = this.escapeHtml(data.color || '-');
    const stock = this.escapeHtml(String(data.stock));

    const text = `
⚠️ <b>Низький залишок товару</b>
🛍 Товар: ${productName}
🏷 SKU: ${sku}
📏 Розмір: ${size}
🎨 Колір: ${color}
📉 Залишок: <b>${stock}</b> шт.
    `.trim();

    await this.sendMessage(text, 'notifyOnLowStock');
  }

  // Ошибки сервера — в тот же чат, без тумблера в настройках
  async sendErrorAlert(data: { title: string; details?: string }): Promise<void> {
    const details = data.details ? `\n<pre>${this.escapeHtml(data.details.slice(0, 3000))}</pre>` : '';
    await this.sendMessage(`🔥 <b>${this.escapeHtml(data.title)}</b>${details}`);
  }
}
