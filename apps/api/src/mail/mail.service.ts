import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config';

export interface OutgoingMail { to: string; subject: string; text: string }

/**
 * ส่งอีเมล — ลำดับ: Resend (RESEND_API_KEY) → ตัวส่งต่อผ่าน HTTPS (MAIL_WEBHOOK_URL เช่น Google Apps Script)
 * → SMTP (SMTP_HOST) → พิมพ์ลง console (โหมดพัฒนา)
 * หมายเหตุ: Render แพ็กเกจฟรีบล็อกพอร์ต SMTP (25/465/587) จึงต้องใช้ Resend หรือ MAIL_WEBHOOK_URL
 */
@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');
  private smtp?: Transporter;

  async send(mail: OutgoingMail): Promise<void> {
    if (config.resendApiKey) return this.sendResend(mail);
    if (config.mailWebhook) return this.sendWebhook(mail, config.mailWebhook);
    const smtp = config.smtp;
    if (smtp) {
      this.smtp ??= nodemailer.createTransport({
        host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.pass },
        // ถ้าพอร์ตถูกบล็อก ให้ล้มเร็ว ไม่ค้างหน้าเว็บ
        connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
      });
      try {
        await this.smtp.sendMail({ from: config.mailFrom.includes('resend.dev') ? `TEMBO <${smtp.user}>` : config.mailFrom, to: mail.to, subject: mail.subject, text: mail.text });
        return;
      } catch (e) {
        this.log.error(`SMTP error: ${(e as Error).message}`);
        throw new Error('Failed to send email');
      }
    }
    this.log.log(`[DEV MAIL] to=${mail.to} | ${mail.subject} | ${mail.text}`);
  }

  /** POST {secret,to,subject,text} → ตอบ {ok:true} (Apps Script ตอบผ่าน redirect — fetch ตามให้เอง) */
  private async sendWebhook(mail: OutgoingMail, hook: { url: string; secret: string }) {
    try {
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ secret: hook.secret, to: mail.to, subject: mail.subject, text: mail.text }),
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.text();
      let ok = false;
      try { ok = JSON.parse(body).ok === true; } catch { /* ไม่ใช่ JSON */ }
      if (!res.ok || !ok) throw new Error(`status ${res.status}: ${body.slice(0, 200)}`);
    } catch (e) {
      this.log.error(`Mail webhook error: ${(e as Error).message}`);
      throw new Error('Failed to send email');
    }
  }

  private async sendResend(mail: OutgoingMail) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mailFrom, to: mail.to, subject: mail.subject, text: mail.text }),
    });
    if (!res.ok) {
      this.log.error(`Resend error ${res.status}: ${await res.text()}`);
      throw new Error('Failed to send email');
    }
  }
}
