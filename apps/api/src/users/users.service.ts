import { ConflictException, Injectable } from '@nestjs/common';
import { MeResponse, UpdateProfileInput } from '@tembo/shared';
import { OtpService } from '../auth/otp.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly otp: OtpService) {}

  async me(userId: string): Promise<MeResponse> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { wallet: true } });
    const [responses, surveysPosted, earned] = await Promise.all([
      this.prisma.surveyResponse.count({ where: { userId } }),
      this.prisma.survey.count({ where: { ownerId: userId } }),
      this.prisma.surveyResponse.aggregate({ where: { userId }, _sum: { reward: true } }),
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
      stats: { responses, surveysPosted, coinEarned: earned._sum.reward ?? 0 },
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

  async wallet(userId: string) {
    const wallet = await this.prisma.wallet.findUniqueOrThrow({ where: { userId } });
    const entries = await this.prisma.ledgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { tx: { select: { type: true, memo: true } } },
    });
    return {
      balance: wallet.balance,
      entries: entries.map((e) => ({ id: e.id, delta: e.delta, type: e.tx.type, memo: e.tx.memo, createdAt: e.createdAt })),
    };
  }
}
