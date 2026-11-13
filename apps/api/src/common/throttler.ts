import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ACCESS_COOKIE } from './auth';

/**
 * นับโควตาต่อผู้ใช้ (จาก access token) ถ้าล็อกอินอยู่ ไม่อย่างนั้นนับต่อ IP
 * — บนเซิร์ฟเวอร์จริงคำขอทุกอันผ่าน proxy ของ Vercel ถ้านับต่อ IP อย่างเดียวผู้ใช้ทุกคนจะใช้โควตาร่วมกัน
 * (อ่าน sub จาก token โดยไม่ตรวจลายเซ็น — ใช้แค่เป็นกุญแจนับ ไม่ได้ใช้ยืนยันตัวตน)
 */
@Injectable()
export class ClientThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const token: string | undefined = req.cookies?.[ACCESS_COOKIE];
    const payload = token?.split('.')[1];
    if (payload) {
      try {
        const sub = JSON.parse(Buffer.from(payload, 'base64url').toString()).sub;
        if (typeof sub === 'string') return `u:${sub}`;
      } catch { /* token เสีย → ใช้ IP */ }
    }
    return `ip:${req.ip}`;
  }
}
