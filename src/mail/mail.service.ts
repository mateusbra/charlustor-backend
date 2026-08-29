import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: false,
    });
  }

  async sendPasswordReset(email: string, resetLink: string): Promise<void> {
    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'no-reply@charlustor.local',
      to: email,
      subject: 'Redefinição de senha — Torneios Master Duel',
      text: `Recebemos um pedido para redefinir sua senha. Acesse o link para continuar: ${resetLink}\n\nSe você não pediu isso, ignore este e-mail.`,
      html: `<p>Recebemos um pedido para redefinir sua senha.</p><p><a href="${resetLink}">Clique aqui para redefinir sua senha</a></p><p>Se você não pediu isso, ignore este e-mail.</p>`,
    });
    this.logger.log(`Password reset email sent to ${email}`);
  }
}
