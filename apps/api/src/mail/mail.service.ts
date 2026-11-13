import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config';

export interface OutgoingMail { to: string; subject: string; text: string }

/**
 * ส่งอีเมล — ลำดับ: Resend (RESEND_API_KEY) → SMTP (SMTP_HOST เช่น Gmail) → พิมพ์ลง console (โหมดพัฒนา)
 */
@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  private smtp?: Transporter;

  async send(mail: OutgoingMail): Promise<void> {
    if (config.resendApiKey) return this.sendResend(mail);
    const smtp = config.smtp;
    if (smtp) {
      this.smtp ??= nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.pass } });
      try {
        await this.smtp.sendMail({ from: config.mailFrom.includes('resend.dev') ? `TEMBO <${smtp.user}>` : config.mailFrom, to: mail.to, subject: mail.subject, text: mail.text });
        return;
      } catch (e) {
        this.log.error(`SMTP error: ${(e as Error).message}`);
        throw new Error('ส่งอีเมลไม่สำเร็จ');
      }
    }
    this.log.log(`[DEV MAIL] to=${mail.to} | ${mail.subject} | ${mail.text}`);
  }

  private async sendResend(mail: OutgoingMail) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mailFrom, to: mail.to, subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) {
      this.log.error(`Resend error ${res.status}: ${await res.text()}`);
      throw new Error('ส่งอีเมลไม่สำเร็จ');
    }
  }
}
