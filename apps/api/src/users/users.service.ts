import { ConflictException, Injectable } from '@nestjs/common';
import { MeResponse, UpdateProfileInput, WalletResponse } from '@tembo/shared';
import { OtpService } from '../auth/otp.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly otp: OtpService) {}

  async me(userId: string): Promise<MeResponse> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { wallet: true } });
    const [responses, surveysPosted, earned, eventsJoined, eventsCheckedIn] = await Promise.all([
      this.prisma.surveyResponse.count({ where: { userId } }),
      this.prisma.survey.count({ where: { ownerId: userId } }),
      this.prisma.surveyResponse.aggregate({ where: { userId }, _sum: { reward: true } }),
      this.prisma.eventRegistration.count({ where: { userId, status: 'REGISTERED' } }),
      this.prisma.eventRegistration.count({ where: { userId, checkedInAt: { not: null } } }),
    ]);
    return {
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      faculty: u.faculty,
      studyYear: u.studyYear,
      interests: u.interests,
      cmuEmail: u.cmuEmail,
      cmuVerified: !!u.cmuVerifiedAt,
      role: u.role,
      referralCode: u.referralCode,
      onboarded: !!(u.displayName && u.faculty && u.studyYear && u.interests.length),
      balance: u.wallet?.balance ?? 0,
      stats: { responses, surveysPosted, coinEarned: earned._sum.reward ?? 0, eventsJoined, eventsCheckedIn },
    };
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    await this.prisma.user.update({ where: { id: userId }, data: input });
    return this.me(userId);
  }

  async requestCmuVerification(userId: string, cmuEmail: string) {
    const me = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (me.cmuVerifiedAt) throw new ConflictException('บัญชีนี้ยืนยันอีเมล CMU แล้ว');
    const taken = await this.prisma.user.findUnique({ where: { cmuEmail } });
    if (taken && taken.id !== userId) throw new ConflictException('อีเมล CMU นี้ถูกใช้กับบัญชีอื่นแล้ว');
    await this.otp.issue('VERIFY_CMU', cmuEmail, userId);
  }

  async confirmCmuVerification(userId: string, code: string) {
    const cmuEmail = await this.otp.consume('VERIFY_CMU', code, { userId });
    try {
      await this.prisma.user.update({ where: { id: userId }, data: { cmuEmail, cmuVerifiedAt: new Date() } });
    } catch {
      throw new ConflictException('อีเมล CMU นี้ถูกใช้กับบัญชีอื่นแล้ว');
    }
    return this.me(userId);
  }

  /** กระเป๋า Coin: ยอด, สรุปได้/ใช้ และรายการล่าสุด (limit ≤ 100, before = cursor วันที่) */
  async wallet(userId: string, limit = 20, before?: Date): Promise<WalletResponse> {
    const wallet = await this.prisma.wallet.findUniqueOrThrow({ where: { userId } });
    const take = Math.min(Math.max(limit, 1), 100);
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { walletId: wallet.id, ...(before ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      include: { tx: { select: { type: true, memo: true } } },
    });
    const sums = await this.prisma.$queryRaw<{ earned: bigint | null; spent: bigint | null }[]>`
      SELECT SUM(CASE WHEN e.delta > 0 AND t.type IN ('SIGNUP_BONUS','SURVEY_REWARD','EVENT_REWARD','ADMIN_ADJUST') THEN e.delta END) AS earned,
             SUM(CASE WHEN e.delta < 0 THEN -e.delta END) - COALESCE(SUM(CASE WHEN e.delta > 0 AND t.type = 'ESCROW_REFUND' THEN e.delta END), 0) AS spent
      FROM "LedgerEntry" e JOIN "LedgerTx" t ON t.id = e."txId" WHERE e."walletId" = ${wallet.id}`;
    const page = entries.slice(0, take);
    return {
      balance: wallet.balance,
      earned: Number(sums[0]?.earned ?? 0),
      spent: Number(sums[0]?.spent ?? 0),
      entries: page.map((e) => ({ id: e.id, delta: e.delta, type: e.tx.type, memo: e.tx.memo, createdAt: e.createdAt.toISOString() })),
      nextBefore: entries.length > take ? page[page.length - 1].createdAt.toISOString() : null,
    };
  }
}
