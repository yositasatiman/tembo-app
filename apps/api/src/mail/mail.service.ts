import { Injectable, Logger } from '@nestjs/common';
import { config } from '../config';

export interface OutgoingMail { to: string; subject: string; text: string }

/** ส่งอีเมลผ่าน Resend ถ้ามี RESEND_API_KEY ไม่อย่างนั้นพิมพ์ลง console (โหมดพัฒนา) */
@Injectable()
export class MailService {
  private readonly log = new Logger('Mail');

  async send(mail: OutgoingMail): Promise<void> {
    if (!config.resendApiKey) {
      this.log.log(`[DEV MAIL] to=${mail.to} | ${mail.subject} | ${mail.text}`);
      return;
    }
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
