import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomInt } from 'crypto';
import { Prisma, SYSTEM_WALLETS, User } from '@tembo/db';
import { COIN_RULES } from '@tembo/shared';
import { config } from '../config';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { OtpService } from './otp.service';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ไม่มี 0/O/1/I เพื่อลดการอ่านผิด
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export interface IssuedTokens { accessToken: string; refreshToken: string }

const REFRESH_REUSE_GRACE_MS = 30_000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly ledger: LedgerService,
    private readonly jwt: JwtService,
  ) {}

  requestLoginOtp(email: string) {
    return this.otp.issue('LOGIN', email);
  }

  /** ยืนยัน OTP → หาผู้ใช้หรือสร้างบัญชีใหม่ (พร้อมกระเป๋าและโบนัสสมัคร) → ออก token */
  async login(email: string, code: string, referralCode: string | undefined, userAgent?: string) {
    await this.otp.consume('LOGIN', code, { email });
    let user = await this.prisma.user.findUnique({ where: { email } });
    let isNew = false;
    if (!user) {
      try {
        user = await this.createUser(email, referralCode);
        isNew = true;
      } catch (e) {
        // ล็อกอินพร้อมกันสองครั้ง: อีกคำขอสร้างบัญชีไปแล้ว
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          user = await this.prisma.user.findUniqueOrThrow({ where: { email } });
        } else throw e;
      }
    }
    // อีเมลใน ADMIN_EMAILS ได้สิทธิ์แอดมินอัตโนมัติ (ใช้ตั้งแอดมินบนเซิร์ฟเวอร์โดยไม่ต้องรันสคริปต์)
    if (user.role !== 'ADMIN' && config.adminEmails.includes(user.email)) {
      user = await this.prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
    }
    const tokens = await this.issueSession(user, userAgent);
    return { user, isNew, tokens };
  }

  private async createUser(email: string, referralCode?: string): Promise<User> {
    const referrer = referralCode
      ? await this.prisma.user.findUnique({ where: { referralCode }, select: { id: true } })
      : null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
      try {
        return await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({ data: { email, referralCode: code, referredById: referrer?.id } });
          const wallet = await tx.wallet.create({ data: { kind: 'USER', userId: user.id } });
          await this.ledger.post(tx, {
            type: 'SIGNUP_BONUS',
            idempotencyKey: `signup:${user.id}`,
            memo: 'โบนัสสมัครสมาชิก',
            entries: [
              { walletId: SYSTEM_WALLETS.MINT, delta: -COIN_RULES.SIGNUP_BONUS },
              { walletId: wallet.id, delta: COIN_RULES.SIGNUP_BONUS },
            ],
          });
          return user;
        });
      } catch (e) {
        const target = (e as Prisma.PrismaClientKnownRequestError).meta?.target;
        const isCodeClash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
          && String(target).includes('referralCode');
        if (!isCodeClash) throw e;
      }
    }
    throw new Error('Could not generate referral code');
  }

  async issueSession(user: Pick<User, 'id' | 'role'>, userAgent?: string): Promise<IssuedTokens> {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: sha256(refreshToken),
        userAgent: userAgent?.slice(0, 255),
        expiresAt: new Date(Date.now() + config.refreshTokenTtlDays * 86_400_000),
      },
    });
    const accessToken = await this.jwt.signAsync({ sub: user.id, role: user.role }, { expiresIn: config.accessTokenTtlSec });
    return { accessToken, refreshToken };
  }

  /** หมุน refresh token: ใช้ได้ครั้งเดียว ถ้าเจอ token เก่าถูกใช้ซ้ำ = ยกเลิกทุกเซสชันของผู้ใช้นั้น */
  async refresh(refreshToken: string | undefined, userAgent?: string): Promise<IssuedTokens> {
    if (!refreshToken) throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
    const session = await this.prisma.session.findUnique({ where: { refreshTokenHash: sha256(refreshToken) }, include: { user: true } });
    if (!session) throw new UnauthorizedException('กรุณาเข้าสู่ระบบ');
    if (session.revokedAt) {
      // เพิ่งหมุนไปไม่ถึง 30 วินาที = น่าจะเป็นหลายแท็บ refresh พร้อมกัน ไม่ใช่ token ถูกขโมย
      if (Date.now() - session.revokedAt.getTime() < REFRESH_REUSE_GRACE_MS) throw new UnauthorizedException('กรุณาลองใหม่');
      await this.prisma.session.updateMany({ where: { userId: session.userId, revokedAt: null }, data: { revokedAt: new Date() } });
      throw new UnauthorizedException('กรุณาเข้าสู่ระบบใหม่');
    }
    if (session.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('เซสชันหมดอายุ');
    const revoked = await this.prisma.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (revoked.count !== 1) throw new UnauthorizedException('กรุณาเข้าสู่ระบบใหม่');
    return this.issueSession(session.user, userAgent);
  }

  async logout(refreshToken: string | undefined) {
    if (!refreshToken) return;
    await this.prisma.session.updateMany({ where: { refreshTokenHash: sha256(refreshToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }
}
