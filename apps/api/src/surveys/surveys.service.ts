import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger,
  NotFoundException, OnModuleDestroy, OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, SYSTEM_WALLETS } from '@tembo/db';
import {
  CreateSurveyInput, quoteSurvey, SURVEY_RULES, SurveyDetail, SurveyQuoteResponse, SurveySummary,
} from '@tembo/shared';
import { LedgerService, Tx } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';
import { proRata } from './pro-rata';

const SYSTEM_KEY = 'SYSTEM';
type Db = Tx | PrismaService;

const surveyInclude = {
  owner: { select: { displayName: true, faculty: true } },
  escrowWallet: { select: { balance: true } },
} satisfies Prisma.SurveyInclude;
type SurveyRow = Prisma.SurveyGetPayload<{ include: typeof surveyInclude }>;

/**
 * เศรษฐกิจ Coin ของแบบสอบถาม (docs/coin-rules.md)
 * - Coin รางวัลถูกล็อกใน Escrow ของแต่ละแบบสอบถาม แล้วจ่ายให้ผู้ตอบทีละคน
 * - ปิดรับเมื่อครบโควตา / หมดเวลา / ผู้โพสต์กดปิด → คืน Coin ที่เหลือตามสัดส่วนให้ผู้ลงแต่ละราย
 * - ทุกการเปลี่ยนสถานะล็อกแถว Survey (FOR UPDATE) ก่อน แล้วค่อยล็อกกระเป๋าใน LedgerService
 */
@Injectable()
export class SurveysService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SurveysService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.closeExpired().catch((e) => this.log.error('closeExpired failed', e));
    }, 60_000);
  }
  onModuleDestroy() { clearInterval(this.timer); }

  // ───────────── ราคา / สิทธิ์ ─────────────

  private async isFirstPost(db: Db, userId: string) {
    return (await db.survey.count({ where: { ownerId: userId } })) === 0;
  }

  async subsidyEligibility(db: Db, userId: string) {
    const used = await db.survey.count({ where: { subsidyStatus: { in: ['PENDING', 'APPROVED'] } } });
    const remainingSlots = Math.max(0, SURVEY_RULES.SUBSIDY_MAX_SURVEYS - used);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { cmuVerifiedAt: true } });
    let reason: string | null = null;
    if (!user.cmuVerifiedAt) reason = 'ต้องยืนยันอีเมล @cmu.ac.th ก่อนจึงจะขอระบบสมทบได้';
    else if (await db.survey.count({ where: { ownerId: userId, subsidyStatus: { in: ['PENDING', 'APPROVED'] } } })) reason = 'คุณใช้สิทธิ์ระบบสมทบไปแล้ว (1 คนได้ 1 ครั้ง)';
    else if (remainingSlots === 0) reason = `สิทธิ์ระบบสมทบครบ ${SURVEY_RULES.SUBSIDY_MAX_SURVEYS} แบบสอบถามแล้ว`;
    return { eligible: !reason, reason, remainingSlots };
  }

  async quoteInfo(userId: string): Promise<SurveyQuoteResponse> {
    return { isFirstPost: await this.isFirstPost(this.prisma, userId), subsidy: await this.subsidyEligibility(this.prisma, userId) };
  }

  // ───────────── สร้าง ─────────────

  async create(userId: string, input: CreateSurveyInput): Promise<SurveyDetail> {
    const id = await this.prisma.$transaction(async (tx) => {
      // กันกดสร้างพร้อมกันหลายอัน (สิทธิ์โพสต์แรกฟรี) และแย่งสิทธิ์สมทบ
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${`survey-create:${userId}`}))`;
      if (input.requestSubsidy) await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('survey-subsidy'))`;

      if (input.requestSubsidy) {
        const elig = await this.subsidyEligibility(tx, userId);
        if (!elig.eligible) throw new BadRequestException(elig.reason);
      }
      const isFirstPost = await this.isFirstPost(tx, userId);
      const q = quoteSurvey({ ...input, isFirstPost, withSubsidy: input.requestSubsidy })!;
      if (input.ownerContribution < q.minOwnerContribution) {
        throw new BadRequestException(`ต้องลง Coin อย่างน้อย ${q.minOwnerContribution} (พอจ่ายผู้ตอบ 1 คน)`);
      }
      if (input.ownerContribution > q.maxOwnerContribution) {
        throw new BadRequestException(`ลง Coin ได้สูงสุด ${q.maxOwnerContribution} (ยอดรางวัลรวม${q.subsidyAmount ? ' หักส่วนที่ระบบสมทบ' : ''})`);
      }

      const escrow = await tx.wallet.create({ data: { kind: 'ESCROW' } });
      const survey = await tx.survey.create({
        data: {
          ownerId: userId,
          title: input.title,
          description: input.description || null,
          questionCount: input.questionCount,
          rewardPerResponse: input.rewardPerResponse,
          quota: input.quota,
          targetPool: q.targetPool,
          postFee: q.postFee,
          status: input.requestSubsidy ? 'PENDING_REVIEW' : 'OPEN',
          subsidyStatus: input.requestSubsidy ? 'PENDING' : 'NONE',
          subsidyAmount: q.subsidyAmount,
          escrowWalletId: escrow.id,
          closesAt: input.closesAt,
        },
      });
      const owner = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      if (q.postFee > 0) {
        await this.ledger.post(tx, {
          type: 'POST_FEE', idempotencyKey: `survey:${survey.id}:fee`, memo: `ค่าโพสต์แบบสอบถาม "${survey.title}"`,
          entries: [{ walletId: owner.id, delta: -q.postFee }, { walletId: SYSTEM_WALLETS.BURN, delta: q.postFee }],
        });
      }
      await this.fund(tx, survey, userId, owner.id, input.ownerContribution, 'OWNER');
      return survey.id;
    });
    return this.detail(id, userId);
  }

  private async fund(tx: Tx, survey: { id: string; title: string; escrowWalletId: string }, userId: string, walletId: string, amount: number, kind: 'OWNER' | 'SPONSOR') {
    await this.ledger.post(tx, {
      type: 'ESCROW_FUND', idempotencyKey: `survey:${survey.id}:fund:${randomUUID()}`,
      memo: kind === 'OWNER' ? `ลง Coin ในแบบสอบถาม "${survey.title}"` : `สนับสนุนแบบสอบถาม "${survey.title}"`,
      entries: [{ walletId, delta: -amount }, { walletId: survey.escrowWalletId, delta: amount }],
    });
    await tx.surveyContribution.upsert({
      where: { surveyId_key: { surveyId: survey.id, key: userId } },
      create: { surveyId: survey.id, kind, userId, key: userId, amount },
      update: { amount: { increment: amount } },
    });
  }

  // ───────────── ล็อก / โหลด ─────────────

  private async lock(tx: Tx, id: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Survey" WHERE id = ${id} FOR UPDATE`;
    if (!rows.length) throw new NotFoundException('ไม่พบแบบสอบถาม');
    return tx.survey.findUniqueOrThrow({ where: { id }, include: { ...surveyInclude, contributions: true } });
  }

  private remainingToFund(s: { targetPool: number; subsidyStatus: string; subsidyAmount: number; contributions: { amount: number }[] }) {
    const funded = s.contributions.reduce((sum, c) => sum + c.amount, 0);
    const reserved = s.subsidyStatus === 'PENDING' ? s.subsidyAmount : 0;
    return Math.max(0, s.targetPool - funded - reserved);
  }

  // ───────────── สนับสนุน ─────────────

  async sponsor(userId: string, id: string, amount: number) {
    await this.prisma.$transaction(async (tx) => {
      const s = await this.lock(tx, id);
      if (s.status === 'CLOSED' || s.closesAt <= new Date()) throw new BadRequestException('แบบสอบถามนี้ปิดรับแล้ว');
      if (await tx.surveyResponse.findUnique({ where: { surveyId_userId: { surveyId: id, userId } } })) {
        throw new BadRequestException('คุณตอบแบบสอบถามนี้ไปแล้ว จึงสนับสนุนไม่ได้');
      }
      const remaining = this.remainingToFund(s);
      if (remaining === 0) throw new BadRequestException('ยอดรางวัลครบแล้ว');
      if (amount > remaining) throw new BadRequestException(`สนับสนุนได้อีกไม่เกิน ${remaining} Coin`);
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      await this.fund(tx, s, userId, wallet.id, amount, s.ownerId === userId ? 'OWNER' : 'SPONSOR');
    });
    return this.detail(id, userId);
  }

  // ───────────── ระบบสมทบ (แอดมิน) ─────────────

  async pendingSubsidies() {
    const rows = await this.prisma.survey.findMany({
      where: { subsidyStatus: 'PENDING' },
      orderBy: { createdAt: 'asc' },
      include: { owner: { select: { displayName: true, email: true, cmuEmail: true, faculty: true } } },
    });
    return rows.map((s) => ({
      id: s.id, title: s.title, description: s.description, questionCount: s.questionCount,
      rewardPerResponse: s.rewardPerResponse, quota: s.quota, targetPool: s.targetPool,
      subsidyAmount: s.subsidyAmount, createdAt: s.createdAt, owner: s.owner,
    }));
  }

  async reviewSubsidy(adminId: string, id: string, approve: boolean, note?: string) {
    await this.prisma.$transaction(async (tx) => {
      const s = await this.lock(tx, id);
      if (s.subsidyStatus !== 'PENDING') throw new ConflictException('แบบสอบถามนี้ไม่ได้รอการตรวจ');
      if (approve) {
        await this.ledger.post(tx, {
          type: 'SUBSIDY', idempotencyKey: `survey:${id}:subsidy`, memo: `ระบบสมทบแบบสอบถาม "${s.title}"`,
          entries: [{ walletId: SYSTEM_WALLETS.MINT, delta: -s.subsidyAmount }, { walletId: s.escrowWalletId, delta: s.subsidyAmount }],
        });
        await tx.surveyContribution.create({ data: { surveyId: id, kind: 'SUBSIDY', key: SYSTEM_KEY, amount: s.subsidyAmount } });
      }
      await tx.survey.update({
        where: { id },
        data: {
          subsidyStatus: approve ? 'APPROVED' : 'REJECTED',
          subsidyAmount: approve ? s.subsidyAmount : 0,
          subsidyNote: note || null,
          status: s.status === 'PENDING_REVIEW' ? 'OPEN' : s.status,
        },
      });
      this.log.log(`subsidy ${approve ? 'approved' : 'rejected'} survey=${id} by admin=${adminId}`);
    });
  }

  // ───────────── ตอบ / จ่ายรางวัล ─────────────

  /** บันทึกว่าผู้ใช้ตอบครบแล้ว และจ่ายรางวัลจาก Escrow (ขั้นที่ 3 จะเรียกหลังบันทึกคำตอบ) */
  async recordResponse(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.lock(tx, id);
      const blocked = await this.respondBlockedReason(tx, s, userId);
      if (blocked) throw blocked.conflict ? new ConflictException(blocked.reason) : new BadRequestException(blocked.reason);

      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      await this.ledger.post(tx, {
        type: 'SURVEY_REWARD', idempotencyKey: `survey:${id}:resp:${userId}`, memo: `รางวัลตอบแบบสอบถาม "${s.title}"`,
        entries: [{ walletId: s.escrowWalletId, delta: -s.rewardPerResponse }, { walletId: wallet.id, delta: s.rewardPerResponse }],
      });
      await tx.surveyResponse.create({ data: { surveyId: id, userId, reward: s.rewardPerResponse } });
      const updated = await tx.survey.update({ where: { id }, data: { responsesCount: { increment: 1 } } });
      if (updated.responsesCount >= updated.quota) await this.closeLocked(tx, id);
      const after = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id }, select: { balance: true } });
      return { reward: s.rewardPerResponse, balance: after.balance };
    });
  }

  private async respondBlockedReason(db: Db, s: SurveyRow & { contributions: { key: string }[] }, userId: string): Promise<{ reason: string; conflict?: boolean } | null> {
    if (s.ownerId === userId) return { reason: 'ตอบแบบสอบถามของตัวเองไม่ได้' };
    if (await db.surveyResponse.findUnique({ where: { surveyId_userId: { surveyId: s.id, userId } } })) return { reason: 'คุณตอบแบบสอบถามนี้ไปแล้ว', conflict: true };
    if (s.status === 'PENDING_REVIEW') return { reason: 'แบบสอบถามนี้ยังรอแอดมินตรวจ' };
    if (s.status === 'CLOSED' || s.closesAt <= new Date() || s.responsesCount >= s.quota) return { reason: 'แบบสอบถามนี้ปิดรับแล้ว' };
    if (s.contributions.some((c) => c.key === userId)) return { reason: 'ผู้ที่สนับสนุนแบบสอบถามนี้ตอบไม่ได้' };
    const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { cmuVerifiedAt: true } });
    if (!user.cmuVerifiedAt) return { reason: 'ต้องยืนยันอีเมล @cmu.ac.th ก่อนจึงจะรับ Coin ได้' };
    if (s.escrowWallet.balance < s.rewardPerResponse) return { reason: 'Coin รางวัลของแบบสอบถามนี้หมดแล้ว รอผู้โพสต์หรือเพื่อนเติม' };
    return null;
  }

  // ───────────── ปิด / คืน Coin ─────────────

  async closeByOwner(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const s = await this.lock(tx, id);
      if (s.ownerId !== userId) throw new ForbiddenException('เฉพาะผู้โพสต์ที่ปิดแบบสอบถามได้');
      if (s.status === 'CLOSED') throw new BadRequestException('แบบสอบถามนี้ปิดไปแล้ว');
      await this.closeLocked(tx, id);
    });
    return this.detail(id, userId);
  }

  /** ปิดแบบสอบถามที่หมดเวลา (เรียกทุก 1 นาที) — คืนจำนวนที่ปิด */
  async closeExpired(now = new Date()) {
    const due = await this.prisma.survey.findMany({
      where: { status: { in: ['OPEN', 'PENDING_REVIEW'] }, closesAt: { lte: now } },
      select: { id: true }, take: 100,
    });
    for (const { id } of due) {
      await this.prisma.$transaction(async (tx) => {
        const s = await this.lock(tx, id);
        if (s.status !== 'CLOSED') await this.closeLocked(tx, id);
      });
    }
    return due.length;
  }

  /** ต้องล็อกแถว Survey แล้วเท่านั้น */
  private async closeLocked(tx: Tx, id: string) {
    const s = await tx.survey.findUniqueOrThrow({ where: { id }, include: { escrowWallet: true, contributions: { orderBy: { createdAt: 'asc' } } } });
    if (s.status === 'CLOSED') return;
    const leftover = s.escrowWallet.balance;
    if (leftover > 0) {
      const shares = proRata(leftover, s.contributions.map((c) => c.amount));
      const userIds = s.contributions.filter((c) => c.userId).map((c) => c.userId!);
      const wallets = await tx.wallet.findMany({ where: { userId: { in: userIds } }, select: { id: true, userId: true } });
      const walletOf = new Map(wallets.map((w) => [w.userId!, w.id]));
      const credit = new Map<string, number>();
      s.contributions.forEach((c, i) => {
        if (!shares[i]) return;
        const wid = c.userId ? walletOf.get(c.userId)! : SYSTEM_WALLETS.BURN;
        credit.set(wid, (credit.get(wid) ?? 0) + shares[i]);
      });
      await this.ledger.post(tx, {
        type: 'ESCROW_REFUND', idempotencyKey: `survey:${id}:refund`, memo: `คืน Coin จากแบบสอบถาม "${s.title}"`,
        entries: [{ walletId: s.escrowWalletId, delta: -leftover }, ...[...credit].map(([walletId, delta]) => ({ walletId, delta }))],
      });
      for (const [i, c] of s.contributions.entries()) {
        if (shares[i]) await tx.surveyContribution.update({ where: { id: c.id }, data: { refunded: shares[i] } });
      }
    }
    await tx.survey.update({
      where: { id },
      data: {
        status: 'CLOSED', closedAt: new Date(),
        ...(s.subsidyStatus === 'PENDING' ? { subsidyStatus: 'REJECTED', subsidyAmount: 0, subsidyNote: 'ปิดแบบสอบถามก่อนแอดมินตรวจ' } : {}),
      },
    });
  }

  // ───────────── อ่าน ─────────────

  private summary(s: SurveyRow): SurveySummary {
    const left = Math.max(0, s.quota - s.responsesCount);
    return {
      id: s.id, title: s.title, ownerName: s.owner.displayName, ownerFaculty: s.owner.faculty, questionCount: s.questionCount,
      rewardPerResponse: s.rewardPerResponse, quota: s.quota, responsesCount: s.responsesCount,
      status: s.status, closesAt: s.closesAt.toISOString(),
      payableResponses: s.status === 'CLOSED' ? 0 : Math.min(left, Math.floor(s.escrowWallet.balance / s.rewardPerResponse)),
    };
  }

  async list(): Promise<SurveySummary[]> {
    const rows = await this.prisma.survey.findMany({
      where: { status: 'OPEN', closesAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' }, take: 50, include: surveyInclude,
    });
    return rows.map((s) => this.summary(s));
  }

  async mine(userId: string): Promise<SurveySummary[]> {
    const rows = await this.prisma.survey.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' }, include: surveyInclude });
    return rows.map((s) => this.summary(s));
  }

  async detail(id: string, viewerId: string): Promise<SurveyDetail> {
    const s = await this.prisma.survey.findUnique({ where: { id }, include: { ...surveyInclude, contributions: true } });
    if (!s) throw new NotFoundException('ไม่พบแบบสอบถาม');
    const sum = (k: string) => s.contributions.filter((c) => c.kind === k).reduce((t, c) => t + c.amount, 0);
    const sponsors = s.contributions.filter((c) => c.kind === 'SPONSOR');
    const mine = s.contributions.find((c) => c.key === viewerId);
    const hasResponded = !!(await this.prisma.surveyResponse.findUnique({ where: { surveyId_userId: { surveyId: id, userId: viewerId } } }));
    const blocked = await this.respondBlockedReason(this.prisma, s, viewerId);
    return {
      ...this.summary(s),
      description: s.description,
      targetPool: s.targetPool,
      postFee: s.postFee,
      escrowBalance: s.escrowWallet.balance,
      subsidyStatus: s.subsidyStatus,
      subsidyAmount: s.subsidyAmount,
      subsidyNote: s.subsidyNote,
      funded: { owner: sum('OWNER'), system: sum('SUBSIDY'), sponsors: sum('SPONSOR'), sponsorCount: sponsors.length },
      remainingToFund: s.status === 'CLOSED' ? 0 : this.remainingToFund(s),
      isOwner: s.ownerId === viewerId,
      myContribution: mine?.amount ?? 0,
      hasResponded,
      canRespond: !blocked,
      respondBlockedReason: blocked?.reason ?? null,
      createdAt: s.createdAt.toISOString(),
      closedAt: s.closedAt?.toISOString() ?? null,
    };
  }
}
