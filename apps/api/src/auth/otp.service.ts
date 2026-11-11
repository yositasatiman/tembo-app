import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { OtpPurpose } from '@tembo/db';
import { config } from '../config';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';

const SUBJECT: Record<OtpPurpose, string> = {
  LOGIN: 'รหัสเข้าสู่ระบบ TEMBO',
  VERIFY_CMU: 'รหัสยืนยันอีเมล CMU สำหรับ TEMBO',
};

@Injectable()
export class OtpService {
  constructor(private readonly prisma: PrismaService, private readonly mail: MailService) {}

  private hash(purpose: OtpPurpose, email: string, code: string) {
    return createHmac('sha256', config.otpSecret).update(`${purpose}:${email}:${code}`).digest('hex');
  }

  /** สร้างและส่งรหัส 6 หลัก พร้อมจำกัดความถี่การขอ */
  async issue(purpose: OtpPurpose, email: string, userId?: string) {
    const now = Date.now();
    const recent = await this.prisma.emailOtp.findMany({
      where: { email, purpose, createdAt: { gte: new Date(now - 3600_000) } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (recent[0] && now - recent[0].createdAt.getTime() < config.otp.resendCooldownSec * 1000) {
      throw new HttpException(`กรุณารอ ${config.otp.resendCooldownSec} วินาทีก่อนขอรหัสใหม่`, HttpStatus.TOO_MANY_REQUESTS);
    }
    if (recent.length >= config.otp.maxPerHour) {
      throw new HttpException('ขอรหัสบ่อยเกินไป กรุณาลองใหม่ภายหลัง', HttpStatus.TOO_MANY_REQUESTS);
    }
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.prisma.emailOtp.create({
      data: { email, purpose, userId, codeHash: this.hash(purpose, email, code), expiresAt: new Date(now + config.otp.ttlMin * 60_000) },
    });
    await this.mail.send({
      to: email,
      subject: SUBJECT[purpose],
      text: `รหัสของคุณคือ ${code} (ใช้ได้ ${config.otp.ttlMin} นาที) หากคุณไม่ได้ขอรหัสนี้ ไม่ต้องทำอะไร`,
    });
  }

  /** ตรวจรหัสล่าสุดที่ยังไม่ถูกใช้ — คืนอีเมลที่ยืนยันแล้ว */
  async consume(purpose: OtpPurpose, code: string, where: { email?: string; userId?: string }): Promise<string> {
    const otp = await this.prisma.emailOtp.findFirst({
      where: { purpose, consumedAt: null, ...where },
      orderBy: { createdAt: 'desc' },
    });
    const invalid = new BadRequestException('รหัสไม่ถูกต้องหรือหมดอายุ');
    if (!otp || otp.expiresAt.getTime() < Date.now()) throw invalid;
    if (otp.attempts >= config.otp.maxAttempts) throw new BadRequestException('ใส่รหัสผิดเกินกำหนด กรุณาขอรหัสใหม่');

    const a = Buffer.from(this.hash(purpose, otp.email, code), 'hex');
    const b = Buffer.from(otp.codeHash, 'hex');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await this.prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw invalid;
    }
    // updateMany แบบมีเงื่อนไข กันการใช้รหัสเดียวกันซ้ำเมื่อส่งคำขอพร้อมกัน
    const used = await this.prisma.emailOtp.updateMany({
      where: { id: otp.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    if (used.count !== 1) throw invalid;
    return otp.email;
  }
}
