import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, Logger,
  NotFoundException, OnModuleDestroy, OnModuleInit,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { Prisma, SYSTEM_WALLETS } from '@tembo/db';
import {
  Answers, CreateSurveyInput, EXTERNAL_SURVEY_RULES, ExternalStartResponse, FormHookInput, parseGoogleFormPrefill, Question, QuestionResult, quoteSurvey,
  SURVEY_RULES, SurveyCategory, SurveyDetail, SurveyForm, SurveyQuoteResponse, SurveyResults, SurveySummary, surveyQuestionCount, TEMBO_CODE_RE, validateAnswers,
  bi, FACULTY_EN, facultyLabel, fmtDMYTime, Lang, pick,
} from '@tembo/shared';
import { config } from '../config';
import { LedgerService, Tx } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications';
import { PrismaService } from '../prisma/prisma.service';
import { proRata } from './pro-rata';

const SYSTEM_KEY = 'SYSTEM';
/** ไม่มี 0/O/1/I เพื่อกันอ่านผิด */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = (len = 6) => [...randomBytes(len)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
/** รหัสอ้างอิงของผู้ตอบ (คงที่ต่อคนต่อแบบสอบถาม) — ให้ใส่ในฟอร์มภายนอก ผู้โพสต์ใช้เทียบกับ CSV ได้ */
const refCodeOf = (surveyId: string, userId: string) =>
  [...createHash('sha256').update(`${surveyId}:${userId}`).digest().subarray(0, 6)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
/** รหัส TEMBO เฉพาะผู้ตอบ (แบบสคริปต์) เช่น TB7K2M9QXA */
const temboCode = () => `TB${randomCode(8)}`;
const sameSecret = (a: string, b: string) => {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const sameCode = (a: string, b: string) => {
  const x = Buffer.from(a.toUpperCase()); const y = Buffer.from(b.toUpperCase());
  return x.length === y.length && timingSafeEqual(x, y);
};
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

  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService, private readonly notifications: NotificationsService) {}

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
    if (!user.cmuVerifiedAt) reason = bi('Verify your @cmu.ac.th email to request the launch subsidy', 'ต้องยืนยันอีเมล @cmu.ac.th ก่อนจึงจะขอระบบสมทบได้');
    else if (await db.survey.count({ where: { ownerId: userId, subsidyStatus: { in: ['PENDING', 'APPROVED'] } } })) reason = bi('You have already used your launch subsidy (once per person)', 'คุณใช้สิทธิ์ระบบสมทบไปแล้ว (1 คนได้ 1 ครั้ง)');
    else if (remainingSlots === 0) reason = bi(`The launch subsidy has been used by all ${SURVEY_RULES.SUBSIDY_MAX_SURVEYS} surveys`, `สิทธิ์ระบบสมทบครบ ${SURVEY_RULES.SUBSIDY_MAX_SURVEYS} แบบสอบถามแล้ว`);
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
      const questionCount = surveyQuestionCount(input);
      const external = input.mode === 'EXTERNAL';
      const draw = input.rewardMode === 'DRAW';
      const prizes = draw ? [...input.prizes].sort((a, b) => b - a) : [];
      const q = quoteSurvey({ ...input, questionCount, isFirstPost, withSubsidy: input.requestSubsidy, prizes })!;
      const script = external && input.externalVerify === 'SCRIPT';
      if (input.ownerContribution < q.minOwnerContribution) {
        throw new BadRequestException(draw
          ? bi(`A lucky draw needs the full ${q.minOwnerContribution} Coin up front`, `สุ่มจับรางวัลต้องลงเหรียญครบ ${q.minOwnerContribution} ตั้งแต่แรก`)
          : bi(`Put in at least ${q.minOwnerContribution} Coin (enough for 1 participant)`, `ต้องลงเหรียญอย่างน้อย ${q.minOwnerContribution} (พอจ่ายผู้ตอบ 1 คน)`));
      }
      if (input.ownerContribution > q.maxOwnerContribution) {
        throw new BadRequestException(bi(`You can put in up to ${q.maxOwnerContribution} Coin (the reward pool${q.subsidyAmount ? ' minus the subsidy' : ''})`, `ลงเหรียญได้สูงสุด ${q.maxOwnerContribution} (ยอดรางวัลรวม${q.subsidyAmount ? ' หักส่วนที่ระบบสมทบ' : ''})`));
      }

      const escrow = await tx.wallet.create({ data: { kind: 'ESCROW' } });
      const survey = await tx.survey.create({
        data: {
          ownerId: userId,
          title: input.title,
          description: input.description || null,
          tags: [...new Set(input.tags)],
          mode: input.mode,
          // แบบสคริปต์: ลิงก์ที่ผู้สร้างวางไว้ใช้ก่อน แล้วสคริปต์ส่งลิงก์จริง + ช่องรหัสมาตอนเชื่อม
          externalUrl: external ? input.externalUrl : null,
          completionCode: external && !script ? randomCode() : null,
          codeEntryId: null,
          webhookSecret: script ? randomBytes(24).toString('base64url') : null,
          category: input.category ?? null,
          estMinutes: input.estMinutes ?? null,
          eligibleFaculties: [...new Set(input.eligibleFaculties)],
          eligibleYears: [...new Set(input.eligibleYears)].sort(),
          rewardMode: input.rewardMode,
          prizes,
          questionCount,
          rewardPerResponse: draw ? prizes[0] : input.rewardPerResponse,
          quota: input.quota,
          targetPool: q.targetPool,
          postFee: q.postFee,
          status: input.requestSubsidy ? 'PENDING_REVIEW' : 'OPEN',
          subsidyStatus: input.requestSubsidy ? 'PENDING' : 'NONE',
          subsidyAmount: q.subsidyAmount,
          escrowWalletId: escrow.id,
          closesAt: input.closesAt,
          questions: external ? undefined : {
            create: input.questions.map((qq, order) => ({
              order, type: qq.type, title: qq.title, required: qq.required,
              options: qq.type === 'SINGLE_CHOICE' || qq.type === 'MULTI_CHOICE' ? qq.options : [],
              scaleMax: qq.type === 'SCALE' ? qq.scaleMax : null,
              minLabel: qq.type === 'SCALE' ? qq.minLabel || null : null,
              maxLabel: qq.type === 'SCALE' ? qq.maxLabel || null : null,
            })),
          },
        },
      });
      const owner = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      if (q.postFee > 0) {
        await this.ledger.post(tx, {
          type: 'POST_FEE', idempotencyKey: `survey:${survey.id}:fee`, memo: bi(`Posting fee for survey "${survey.title}"`, `ค่าโพสต์แบบสอบถาม "${survey.title}"`),
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
      memo: kind === 'OWNER' ? bi(`Reward Coin for survey "${survey.title}"`, `ลงเหรียญในแบบสอบถาม "${survey.title}"`) : bi(`Sponsored survey "${survey.title}"`, `สนับสนุนแบบสอบถาม "${survey.title}"`),
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
    if (!rows.length) throw new NotFoundException(bi('Survey not found', 'ไม่พบแบบสอบถาม'));
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
      if (s.status === 'CLOSED' || s.closesAt <= new Date()) throw new BadRequestException(bi('This survey is closed', 'แบบสอบถามนี้ปิดรับแล้ว'));
      if (await tx.surveyResponse.findUnique({ where: { surveyId_userId: { surveyId: id, userId } } })) {
        throw new BadRequestException(bi('You already answered this survey, so you cannot sponsor it', 'คุณตอบแบบสอบถามนี้ไปแล้ว จึงสนับสนุนไม่ได้'));
      }
      const remaining = this.remainingToFund(s);
      if (remaining === 0) throw new BadRequestException(bi('The reward pool is already full', 'ยอดรางวัลครบแล้ว'));
      if (amount > remaining) throw new BadRequestException(bi(`You can sponsor up to ${remaining} more Coin`, `สนับสนุนได้อีกไม่เกิน ${remaining} เหรียญ`));
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      await this.fund(tx, s, userId, wallet.id, amount, s.ownerId === userId ? 'OWNER' : 'SPONSOR');
      if (s.ownerId !== userId) {
        const who = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { displayName: true } });
        await this.notifications.notify(tx, [s.ownerId],
          { type: 'SURVEY_SPONSORED', title: bi('A friend sponsored your survey', 'มีเพื่อนช่วยสนับสนุน'), body: bi(`${who.displayName ?? 'A friend'} added ${amount} Coin to "${s.title}"`, `${who.displayName ?? 'เพื่อน'} ลง ${amount} เหรียญใน "${s.title}"`), link: `/surveys/${id}` });
      }
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
      if (s.subsidyStatus !== 'PENDING') throw new ConflictException(bi('This survey is not waiting for review', 'แบบสอบถามนี้ไม่ได้รอการตรวจ'));
      if (approve) {
        await this.ledger.post(tx, {
          type: 'SUBSIDY', idempotencyKey: `survey:${id}:subsidy`, memo: bi(`Launch subsidy for survey "${s.title}"`, `ระบบสมทบแบบสอบถาม "${s.title}"`),
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
      await this.notifications.notify(tx, [s.ownerId], approve
        ? { type: 'SUBSIDY_APPROVED', title: bi('Subsidy approved', 'ได้รับระบบสมทบ'), body: bi(`TEMBO added ${s.subsidyAmount} Coin to "${s.title}". It is now open for responses.`, `TEMBO สมทบ ${s.subsidyAmount} เหรียญให้ "${s.title}" แล้ว เปิดรับคำตอบได้`), link: `/surveys/${id}` }
        : { type: 'SUBSIDY_REJECTED', title: bi('Subsidy not approved', 'ไม่ได้รับระบบสมทบ'), body: bi(`"${s.title}"${note ? ` — ${note}` : ''} · open for responses as usual`, `"${s.title}"${note ? ` — ${note}` : ''} · เปิดรับคำตอบตามปกติ`), link: `/surveys/${id}` });
      this.log.log(`subsidy ${approve ? 'approved' : 'rejected'} survey=${id} by admin=${adminId}`);
    });
  }

  // ───────────── ตอบ / จ่ายรางวัล ─────────────

  /** บันทึกคำตอบ แล้วจ่ายรางวัลจาก Escrow ในธุรกรรมเดียวกัน */
  async recordResponse(userId: string, id: string, answers: Answers) {
    return this.prisma.$transaction(async (tx) => {
      const s = await this.lock(tx, id);
      if (s.mode === 'EXTERNAL') throw new BadRequestException(bi('This survey uses an external link. Enter the confirmation code instead.', 'แบบสอบถามนี้ใช้ลิงก์ภายนอก ให้กรอกรหัสยืนยันแทน'));
      await this.assertCanRespond(tx, s, userId);
      const questions = await tx.surveyQuestion.findMany({ where: { surveyId: id }, orderBy: { order: 'asc' } });
      const check = validateAnswers(questions, answers);
      if (!check.ok) throw new BadRequestException({ message: bi('Please answer every required question correctly', 'กรุณาตอบให้ครบและถูกต้อง'), errors: check.errors });
      return this.pay(tx, s, userId, check.clean);
    });
  }

  private async assertCanRespond(db: Db, s: Parameters<SurveysService['respondBlockedReason']>[1], userId: string) {
    const blocked = await this.respondBlockedReason(db, s, userId);
    if (blocked) throw blocked.conflict ? new ConflictException(blocked.reason) : new BadRequestException(blocked.reason);
  }

  /** จ่ายรางวัล + บันทึกคำตอบ (ต้องล็อกแถว Survey และตรวจสิทธิ์แล้ว) */
  private async pay(tx: Tx, s: { id: string; title: string; escrowWalletId: string; rewardPerResponse: number; rewardMode: 'EQUAL' | 'DRAW' }, userId: string, answers: Answers) {
    const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
    if (s.rewardMode === 'DRAW') {
      // สุ่มจับรางวัล: บันทึกสิทธิ์ลุ้น (ยังไม่จ่าย) — สุ่มตอนปิดแบบสอบถาม
      await tx.surveyResponse.create({ data: { surveyId: s.id, userId, reward: 0, answers } });
      const updated = await tx.survey.update({ where: { id: s.id }, data: { responsesCount: { increment: 1 } } });
      if (updated.responsesCount >= updated.quota) await this.closeLocked(tx, s.id);
      const after = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id }, select: { balance: true } });
      return { reward: 0, entered: true, balance: after.balance };
    }
    await this.ledger.post(tx, {
      type: 'SURVEY_REWARD', idempotencyKey: `survey:${s.id}:resp:${userId}`, memo: bi(`Reward for answering "${s.title}"`, `รางวัลตอบแบบสอบถาม "${s.title}"`),
      entries: [{ walletId: s.escrowWalletId, delta: -s.rewardPerResponse }, { walletId: wallet.id, delta: s.rewardPerResponse }],
    });
    await tx.surveyResponse.create({ data: { surveyId: s.id, userId, reward: s.rewardPerResponse, answers } });
    const updated = await tx.survey.update({ where: { id: s.id }, data: { responsesCount: { increment: 1 } } });
    if (updated.responsesCount >= updated.quota) await this.closeLocked(tx, s.id);
    const after = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id }, select: { balance: true } });
    return { reward: s.rewardPerResponse, entered: false, balance: after.balance };
  }

  // ───────────── แบบสอบถามลิงก์ภายนอก ─────────────

  private startInfo(s: { id: string; externalUrl: string | null; codeEntryId: string | null }, userId: string, start: { startedAt: Date; failedAttempts: number; token: string | null; submittedAt: Date | null }): ExternalStartResponse {
    const url = start.token && s.codeEntryId
      ? `${s.externalUrl}?usp=pp_url&${s.codeEntryId}=${encodeURIComponent(start.token)}`
      : s.externalUrl!;
    return {
      code: start.token,
      submittedAt: start.submittedAt?.toISOString() ?? null,
      url,
      refCode: refCodeOf(s.id, userId),
      startedAt: start.startedAt.toISOString(),
      canVerifyAt: new Date(start.startedAt.getTime() + EXTERNAL_SURVEY_RULES.MIN_SECONDS * 1000).toISOString(),
      attemptsLeft: Math.max(0, EXTERNAL_SURVEY_RULES.MAX_ATTEMPTS - start.failedAttempts),
    };
  }

  /** ผู้ตอบกด "เปิดแบบสอบถาม" — บันทึกเวลาเริ่ม (ครั้งแรกเท่านั้น) แล้วคืนลิงก์ */
  async startExternal(userId: string, id: string): Promise<ExternalStartResponse> {
    const s = await this.prisma.survey.findUnique({ where: { id }, include: { ...surveyInclude, contributions: true } });
    if (!s) throw new NotFoundException(bi('Survey not found', 'ไม่พบแบบสอบถาม'));
    if (s.mode !== 'EXTERNAL') throw new BadRequestException(bi('This survey is answered inside TEMBO', 'แบบสอบถามนี้ตอบใน TEMBO'));
    await this.assertCanRespond(this.prisma, s, userId);
    const start = await this.prisma.surveyStart.upsert({
      where: { surveyId_userId: { surveyId: id, userId } },
      create: { surveyId: id, userId, token: s.webhookSecret ? temboCode() : null }, update: {},
    });
    return this.startInfo(s, userId, start);
  }

  /** ผู้ตอบกรอกรหัสจากหน้ายืนยันของฟอร์มภายนอก → จ่ายรางวัล */
  async verifyExternal(userId: string, id: string, code: string) {
    // นับครั้งที่ผิดนอกธุรกรรมจ่ายเงิน เพื่อไม่ให้ถูก rollback ไปพร้อม error
    const outcome = await this.prisma.$transaction(async (tx) => {
      const s = await this.lock(tx, id);
      if (s.mode !== 'EXTERNAL') throw new BadRequestException(bi('This survey is answered inside TEMBO', 'แบบสอบถามนี้ตอบใน TEMBO'));
      if (s.webhookSecret) throw new BadRequestException(bi('This survey checks submissions automatically. No code needed.', 'แบบสอบถามนี้ตรวจการส่งอัตโนมัติ ไม่ต้องกรอกรหัส'));
      await this.assertCanRespond(tx, s, userId);
      const start = await tx.surveyStart.findUnique({ where: { surveyId_userId: { surveyId: id, userId } } });
      if (!start) throw new BadRequestException(bi('Tap "Open survey" first, then enter the confirmation code', 'กด "เปิดแบบสอบถาม" ก่อน แล้วค่อยกรอกรหัสยืนยัน'));
      if (start.failedAttempts >= EXTERNAL_SURVEY_RULES.MAX_ATTEMPTS) throw new ForbiddenException(bi(`You entered a wrong code ${EXTERNAL_SURVEY_RULES.MAX_ATTEMPTS} times. Please contact the survey owner.`, `กรอกรหัสผิดครบ ${EXTERNAL_SURVEY_RULES.MAX_ATTEMPTS} ครั้งแล้ว ติดต่อผู้โพสต์`));
      const wait = start.startedAt.getTime() + EXTERNAL_SURVEY_RULES.MIN_SECONDS * 1000 - Date.now();
      if (wait > 0) throw new BadRequestException(bi(`Finish the survey first (wait ${Math.ceil(wait / 1000)} more seconds)`, `ทำแบบสอบถามให้เสร็จก่อน (รออีก ${Math.ceil(wait / 1000)} วินาที)`));
      if (!s.completionCode || !sameCode(s.completionCode, code)) return { wrong: true as const, left: EXTERNAL_SURVEY_RULES.MAX_ATTEMPTS - start.failedAttempts - 1 };
      return { wrong: false as const, paid: await this.pay(tx, s, userId, {}) };
    });
    if (outcome.wrong) {
      await this.prisma.surveyStart.update({ where: { surveyId_userId: { surveyId: id, userId } }, data: { failedAttempts: { increment: 1 } } });
      throw new BadRequestException(outcome.left > 0
        ? bi(`Wrong confirmation code. Make sure you submitted the form (${outcome.left} tries left).`, `รหัสยืนยันไม่ถูกต้อง ตรวจว่าส่งฟอร์มเรียบร้อยแล้ว (เหลืออีก ${outcome.left} ครั้ง)`)
        : bi('Wrong confirmation code, and no tries left', 'รหัสยืนยันไม่ถูกต้อง และกรอกผิดครบจำนวนครั้งแล้ว'));
    }
    return outcome.paid;
  }

  private async respondBlockedReason(db: Db, s: SurveyRow & { contributions: { key: string }[] }, userId: string): Promise<{ reason: string; conflict?: boolean } | null> {
    if (s.ownerId === userId) return { reason: bi('You cannot answer your own survey', 'ตอบแบบสอบถามของตัวเองไม่ได้') };
    if (await db.surveyResponse.findUnique({ where: { surveyId_userId: { surveyId: s.id, userId } } })) return { reason: bi('You have already answered this survey', 'คุณตอบแบบสอบถามนี้ไปแล้ว'), conflict: true };
    if (s.status === 'PENDING_REVIEW') return { reason: bi('This survey is waiting for admin review', 'แบบสอบถามนี้ยังรอแอดมินตรวจ') };
    if (s.status === 'CLOSED' || s.closesAt <= new Date() || s.responsesCount >= s.quota) return { reason: bi('This survey is closed', 'แบบสอบถามนี้ปิดรับแล้ว') };
    if (s.contributions.some((c) => c.key === userId)) return { reason: bi('Sponsors cannot answer the survey they sponsored', 'ผู้ที่สนับสนุนแบบสอบถามนี้ตอบไม่ได้') };
    if (s.mode === 'IN_APP' && !(await db.surveyQuestion.count({ where: { surveyId: s.id } }))) return { reason: bi('This survey has no questions yet', 'แบบสอบถามนี้ยังไม่มีคำถาม (สร้างก่อนมีระบบคำถาม)') };
    if (s.webhookSecret && !s.webhookConnectedAt) return { reason: bi('The owner has not finished connecting the Google Form to TEMBO yet', 'ผู้โพสต์ยังเชื่อม Google Form กับ TEMBO ไม่เสร็จ') };
    const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { cmuVerifiedAt: true, faculty: true, studyYear: true } });
    if (!user.cmuVerifiedAt) return { reason: bi('Verify your @cmu.ac.th email to earn Coin', 'ต้องยืนยันอีเมล @cmu.ac.th ก่อนจึงจะรับเหรียญได้') };
    if (s.eligibleFaculties.length && !(user.faculty && s.eligibleFaculties.includes(user.faculty))) return { reason: bi(`Open only to the Faculty of ${s.eligibleFaculties.map((f) => FACULTY_EN[f as keyof typeof FACULTY_EN] ?? f).join(', ')}`, `เปิดให้เฉพาะคณะ${s.eligibleFaculties.join(', ')}`) };
    if (s.eligibleYears.length && !(user.studyYear && s.eligibleYears.includes(user.studyYear))) return { reason: bi(`Open only to year ${s.eligibleYears.join(', ')} students`, `เปิดให้เฉพาะชั้นปีที่ ${s.eligibleYears.join(', ')}`) };
    if (s.rewardMode === 'EQUAL' && s.escrowWallet.balance < s.rewardPerResponse) return { reason: bi('This survey has run out of reward Coin. Wait for the owner or a friend to add more.', 'เหรียญรางวัลของแบบสอบถามนี้หมดแล้ว รอผู้โพสต์หรือเพื่อนเติม') };
    return null;
  }

  // ───────────── ปิด / คืน Coin ─────────────

  async closeByOwner(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      const s = await this.lock(tx, id);
      if (s.ownerId !== userId) throw new ForbiddenException(bi('Only the owner can close this survey', 'เฉพาะผู้โพสต์ที่ปิดแบบสอบถามได้'));
      if (s.status === 'CLOSED') throw new BadRequestException(bi('This survey is already closed', 'แบบสอบถามนี้ปิดไปแล้ว'));
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
    const winners = s.rewardMode === 'DRAW' && !s.drawnAt ? await this.draw(tx, s) : 0;
    const leftover = (await tx.wallet.findUniqueOrThrow({ where: { id: s.escrowWalletId } })).balance;
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
        type: 'ESCROW_REFUND', idempotencyKey: `survey:${id}:refund`, memo: bi(`Coin refund from survey "${s.title}"`, `คืนเหรียญจากแบบสอบถาม "${s.title}"`),
        entries: [{ walletId: s.escrowWalletId, delta: -leftover }, ...[...credit].map(([walletId, delta]) => ({ walletId, delta }))],
      });
      for (const [i, c] of s.contributions.entries()) {
        if (shares[i]) await tx.surveyContribution.update({ where: { id: c.id }, data: { refunded: shares[i] } });
      }
    }
    await this.notifications.notify(tx, [s.ownerId], {
      type: 'SURVEY_CLOSED', title: bi('Your survey has closed', 'แบบสอบถามปิดรับแล้ว'),
      body: bi(
        `"${s.title}" got ${s.responsesCount}/${s.quota} responses${s.rewardMode === 'DRAW' ? ` · ${winners} winner(s) drawn` : ''}${leftover > 0 ? ' · leftover Coin refunded' : ''}`,
        `"${s.title}" ได้ผู้ตอบ ${s.responsesCount}/${s.quota} คน${s.rewardMode === 'DRAW' ? ` · สุ่มผู้ได้รางวัลแล้ว ${winners} คน` : ''}${leftover > 0 ? ' · คืนเหรียญที่เหลือตามสัดส่วนแล้ว' : ''}`,
      ), link: `/surveys/${id}/results`,
    });
    await tx.survey.update({
      where: { id },
      data: {
        status: 'CLOSED', closedAt: new Date(),
        ...(s.rewardMode === 'DRAW' ? { drawnAt: new Date() } : {}),
        ...(s.subsidyStatus === 'PENDING' ? { subsidyStatus: 'REJECTED', subsidyAmount: 0, subsidyNote: bi('The survey closed before admin review', 'ปิดแบบสอบถามก่อนแอดมินตรวจ') } : {}),
      },
    });
  }

  /**
   * สุ่มจับรางวัล (ต้องล็อกแถว Survey แล้ว) — ผู้ตอบทุกคนมีโอกาสเท่ากัน ใช้ crypto.randomInt (Fisher–Yates)
   * จ่ายรางวัลอันดับ 1, 2, … จาก Escrow; ถ้าผู้ตอบน้อยกว่าจำนวนรางวัล รางวัลที่เหลือจะคืนตามสัดส่วนตอนปิด
   */
  private async draw(tx: Tx, s: { id: string; title: string; escrowWalletId: string; prizes: number[] }) {
    const entries = await tx.surveyResponse.findMany({ where: { surveyId: s.id }, orderBy: { createdAt: 'asc' }, select: { id: true, userId: true } });
    for (let i = entries.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [entries[i], entries[j]] = [entries[j], entries[i]];
    }
    const picked = entries.slice(0, s.prizes.length);
    const wallets = await tx.wallet.findMany({ where: { userId: { in: picked.map((p) => p.userId) } }, select: { id: true, userId: true } });
    for (const [i, e] of picked.entries()) {
      const prize = s.prizes[i];
      await this.ledger.post(tx, {
        type: 'SURVEY_REWARD', idempotencyKey: `survey:${s.id}:prize:${i + 1}`, memo: bi(`Prize #${i + 1} from survey "${s.title}"`, `รางวัลอันดับ ${i + 1} จากแบบสอบถาม "${s.title}"`),
        entries: [{ walletId: s.escrowWalletId, delta: -prize }, { walletId: wallets.find((w) => w.userId === e.userId)!.id, delta: prize }],
      });
      await tx.surveyResponse.update({ where: { id: e.id }, data: { reward: prize, prizeRank: i + 1 } });
      await this.notifications.notify(tx, [e.userId], {
        type: 'SURVEY_PRIZE_WON', title: bi(`Congratulations! You won prize #${i + 1}`, `ยินดีด้วย! ได้รางวัลอันดับ ${i + 1}`), body: bi(`You received ${prize} Coin from "${s.title}"`, `ได้รับ ${prize} เหรียญจาก "${s.title}"`), link: `/surveys/${s.id}`,
      });
    }
    return picked.length;
  }

  // ───────────── Google Form → TEMBO (Apps Script) ─────────────

  /** สคริปต์ใน Google Form ส่งผลมาเมื่อมีคนกดส่ง (หรือ ping ตอนติดตั้ง) — ตอบ 200 เสมอเพื่อไม่ให้สคริปต์ส่งซ้ำ ยกเว้น secret ผิด */
  async formHook(id: string, input: FormHookInput) {
    const s = await this.prisma.survey.findUnique({ where: { id }, select: { id: true, title: true, ownerId: true, webhookSecret: true, webhookConnectedAt: true } });
    if (!s?.webhookSecret || !sameSecret(s.webhookSecret, input.secret)) throw new ForbiddenException(bi('Invalid secret', 'secret ไม่ถูกต้อง'));
    // ping ตอนติดตั้ง: สคริปต์เพิ่มคำถาม "รหัส TEMBO" ให้แล้ว และส่งลิงก์กรอกล่วงหน้ามาบอกว่าช่องรหัสคือ entry ไหน
    const prefill = input.prefillUrl ? parseGoogleFormPrefill(input.prefillUrl) : null;
    if (prefill) await this.prisma.survey.update({ where: { id }, data: { externalUrl: prefill.formUrl, codeEntryId: prefill.entryId } });
    if (!s.webhookConnectedAt) {
      const first = await this.prisma.survey.updateMany({ where: { id, webhookConnectedAt: null }, data: { webhookConnectedAt: new Date() } });
      if (first.count) {
        await this.notifications.notify(this.prisma, [s.ownerId], {
          type: 'SURVEY_CONNECTED', title: bi('Google Form connected', 'เชื่อม Google Form สำเร็จ'), body: bi(`"${s.title}" is now open. TEMBO will reward people automatically when they submit the form.`, `"${s.title}" เปิดให้ตอบแล้ว ระบบจะให้เหรียญอัตโนมัติเมื่อมีคนส่งฟอร์ม`), link: `/surveys/${id}`,
        });
      }
    }
    if (input.ping) return { ok: true, connected: true };

    const codes = input.codes.filter((c) => TEMBO_CODE_RE.test(c));
    const start = codes.length ? await this.prisma.surveyStart.findFirst({ where: { surveyId: id, token: { in: codes } } }) : null;
    if (!start) return { ok: false, reason: 'No TEMBO code found in the response' };

    return this.prisma.$transaction(async (tx) => {
      const sv = await this.lock(tx, id);
      await tx.surveyStart.update({ where: { surveyId_userId: { surveyId: id, userId: start.userId } }, data: { submittedAt: start.submittedAt ?? new Date() } });
      if (await tx.surveyResponse.findUnique({ where: { surveyId_userId: { surveyId: id, userId: start.userId } } })) return { ok: true, duplicate: true };
      const blocked = await this.respondBlockedReason(tx, sv, start.userId);
      if (blocked) return { ok: false, reason: blocked.reason };
      const paid = await this.pay(tx, sv, start.userId, {});
      await this.notifications.notify(tx, [start.userId], paid.entered
        ? { type: 'SURVEY_REWARDED', title: bi('You are in the lucky draw', 'ได้สิทธิ์ลุ้นรางวัลแล้ว'), body: bi(`"${sv.title}" submitted. Winners are drawn when the survey closes.`, `ส่ง "${sv.title}" เรียบร้อย ระบบจะสุ่มผู้ได้รางวัลตอนปิดแบบสอบถาม`), link: `/surveys/${id}` }
        : { type: 'SURVEY_REWARDED', title: bi(`You received ${paid.reward} Coin`, `ได้รับ ${paid.reward} เหรียญ`), body: bi(`"${sv.title}" submitted. Thanks for helping!`, `ส่ง "${sv.title}" เรียบร้อย ขอบคุณที่ช่วยตอบ`), link: `/surveys/${id}` });
      return { ok: true };
    });
  }

  // ───────────── อ่าน ─────────────

  private summary(s: SurveyRow, viewerId: string, responded = false, saved = false): SurveySummary {
    const left = Math.max(0, s.quota - s.responsesCount);
    return {
      id: s.id, isMine: s.ownerId === viewerId, mode: s.mode, title: s.title, description: s.description, tags: s.tags, ownerName: s.owner.displayName, ownerFaculty: s.owner.faculty, questionCount: s.questionCount,
      rewardPerResponse: s.rewardPerResponse, quota: s.quota, responsesCount: s.responsesCount,
      status: s.status, closesAt: s.closesAt.toISOString(),
      payableResponses: s.status === 'CLOSED' ? 0 : s.rewardMode === 'DRAW' ? left : Math.min(left, Math.floor(s.escrowWallet.balance / s.rewardPerResponse)),
      responded, saved, createdAt: s.createdAt.toISOString(),
      category: (s.category as SurveyCategory | null) ?? null, estMinutes: s.estMinutes,
      eligibleFaculties: s.eligibleFaculties, eligibleYears: s.eligibleYears,
      rewardMode: s.rewardMode, prizes: s.prizes,
      externalVerify: s.mode !== 'EXTERNAL' ? null : s.webhookSecret ? 'SCRIPT' : 'CODE',
    };
  }

  /** สถานะ "ตอบแล้ว" / "บันทึกไว้" ของผู้ดู สำหรับหลายแบบสอบถามพร้อมกัน */
  private async viewerFlags(viewerId: string, ids: string[]) {
    const [done, saved] = await Promise.all([
      this.prisma.surveyResponse.findMany({ where: { userId: viewerId, surveyId: { in: ids } }, select: { surveyId: true } }),
      this.prisma.surveySave.findMany({ where: { userId: viewerId, surveyId: { in: ids } }, select: { surveyId: true } }),
    ]);
    return { done: new Set(done.map((r) => r.surveyId)), saved: new Set(saved.map((r) => r.surveyId)) };
  }

  private async summaries(rows: SurveyRow[], viewerId: string) {
    const f = await this.viewerFlags(viewerId, rows.map((r) => r.id));
    return rows.map((s) => this.summary(s, viewerId, f.done.has(s.id), f.saved.has(s.id)));
  }

  async list(viewerId: string, take = 50): Promise<SurveySummary[]> {
    const rows = await this.prisma.survey.findMany({
      where: { status: 'OPEN', closesAt: { gt: new Date() }, OR: [{ webhookSecret: null }, { webhookConnectedAt: { not: null } }] },
      orderBy: { createdAt: 'desc' }, take, include: surveyInclude,
    });
    return this.summaries(rows, viewerId);
  }

  async mine(userId: string): Promise<SurveySummary[]> {
    const rows = await this.prisma.survey.findMany({ where: { ownerId: userId }, orderBy: { createdAt: 'desc' }, include: surveyInclude });
    return this.summaries(rows, userId);
  }

  /** แบบสอบถามที่บันทึกไว้ (ล่าสุดก่อน) */
  async saved(userId: string): Promise<SurveySummary[]> {
    const saves = await this.prisma.surveySave.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, include: { survey: { include: surveyInclude } } });
    return this.summaries(saves.map((x) => x.survey), userId);
  }

  async save(userId: string, id: string, on: boolean) {
    if (!(await this.prisma.survey.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException(bi('Survey not found', 'ไม่พบแบบสอบถาม'));
    if (on) await this.prisma.surveySave.upsert({ where: { surveyId_userId: { surveyId: id, userId } }, create: { surveyId: id, userId }, update: {} });
    else await this.prisma.surveySave.deleteMany({ where: { surveyId: id, userId } });
    return { saved: on };
  }

  async detail(id: string, viewerId: string): Promise<SurveyDetail> {
    const s = await this.prisma.survey.findUnique({ where: { id }, include: { ...surveyInclude, contributions: true } });
    if (!s) throw new NotFoundException(bi('Survey not found', 'ไม่พบแบบสอบถาม'));
    const sum = (k: string) => s.contributions.filter((c) => c.kind === k).reduce((t, c) => t + c.amount, 0);
    const sponsors = s.contributions.filter((c) => c.kind === 'SPONSOR');
    const mine = s.contributions.find((c) => c.key === viewerId);
    const hasResponded = !!(await this.prisma.surveyResponse.findUnique({ where: { surveyId_userId: { surveyId: id, userId: viewerId } } }));
    const blocked = await this.respondBlockedReason(this.prisma, s, viewerId);
    const isOwner = s.ownerId === viewerId;
    const start = s.mode === 'EXTERNAL' && !isOwner
      ? await this.prisma.surveyStart.findUnique({ where: { surveyId_userId: { surveyId: id, userId: viewerId } } })
      : null;
    const saved = !!(await this.prisma.surveySave.findUnique({ where: { surveyId_userId: { surveyId: id, userId: viewerId } } }));
    const winners = s.drawnAt
      ? await this.prisma.surveyResponse.findMany({ where: { surveyId: id, prizeRank: { not: null } }, orderBy: { prizeRank: 'asc' }, include: { user: { select: { displayName: true } } } })
      : [];
    return {
      ...this.summary(s, viewerId, hasResponded, saved),
      externalUrl: isOwner || start ? s.externalUrl : null,
      completionCode: isOwner ? s.completionCode : null,
      myStart: start ? this.startInfo(s, viewerId, start) : null,
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
      closedAt: s.closedAt?.toISOString() ?? null,
      script: isOwner && s.webhookSecret
        ? { endpoint: `${config.webOrigin}/api/hooks/forms/${id}`, secret: s.webhookSecret, connectedAt: s.webhookConnectedAt?.toISOString() ?? null }
        : null,
      drawnAt: s.drawnAt?.toISOString() ?? null,
      myPrizeRank: winners.find((w) => w.userId === viewerId)?.prizeRank ?? null,
      // ชื่อผู้ได้รางวัลแสดงแบบย่อ (ตัวอักษรแรก) เพื่อความเป็นส่วนตัว
      winners: winners.map((w) => ({ rank: w.prizeRank!, prize: w.reward, name: w.user.displayName ? `${[...w.user.displayName][0]}***` : null })),
    };
  }

  // ───────────── แบบฟอร์ม / ผลลัพธ์ ─────────────

  private toQuestion(q: { id: string; order: number; type: Question['type']; title: string; required: boolean; options: string[]; scaleMax: number | null; minLabel: string | null; maxLabel: string | null }): Question {
    return { id: q.id, order: q.order, type: q.type, title: q.title, required: q.required, options: q.options, scaleMax: q.scaleMax, minLabel: q.minLabel, maxLabel: q.maxLabel };
  }

  /** คำถามสำหรับทำแบบสอบถาม — เปิดให้ผู้โพสต์ (ดูตัวอย่าง) และผู้ที่ตอบได้เท่านั้น */
  async form(id: string, viewerId: string): Promise<SurveyForm> {
    const s = await this.prisma.survey.findUnique({ where: { id }, include: { ...surveyInclude, contributions: true, questions: { orderBy: { order: 'asc' } } } });
    if (!s) throw new NotFoundException(bi('Survey not found', 'ไม่พบแบบสอบถาม'));
    if (s.mode === 'EXTERNAL') throw new BadRequestException(bi('This survey uses an external link', 'แบบสอบถามนี้ใช้ลิงก์ภายนอก'));
    if (s.ownerId !== viewerId) {
      const blocked = await this.respondBlockedReason(this.prisma, s, viewerId);
      if (blocked) throw blocked.conflict ? new ConflictException(blocked.reason) : new ForbiddenException(blocked.reason);
    }
    return { id: s.id, title: s.title, description: s.description, rewardPerResponse: s.rewardPerResponse, questions: s.questions.map((q) => this.toQuestion(q)) };
  }

  private async ownedWithResponses(id: string, viewer: { id: string; role: string }) {
    const s = await this.prisma.survey.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { order: 'asc' } },
        responses: { orderBy: { createdAt: 'asc' }, include: { user: { select: { faculty: true, studyYear: true } } } },
      },
    });
    if (!s) throw new NotFoundException(bi('Survey not found', 'ไม่พบแบบสอบถาม'));
    if (s.ownerId !== viewer.id && viewer.role !== 'ADMIN') throw new ForbiddenException(bi('Only the owner can see the results', 'เฉพาะผู้โพสต์ที่ดูผลได้'));
    return s;
  }

  /** สรุปผล — ไม่มีชื่อ/อีเมลผู้ตอบ เพื่อรักษาความเป็นนิรนาม */
  async results(id: string, viewer: { id: string; role: string }): Promise<SurveyResults> {
    const s = await this.ownedWithResponses(id, viewer);
    const answers = s.responses.map((r) => (r.answers ?? {}) as Answers);
    const questions: QuestionResult[] = s.questions.map((dbq) => {
      const question = this.toQuestion(dbq);
      const vals = answers.map((a) => a[question.id]).filter((v) => v !== undefined && v !== '');
      if (question.type === 'SINGLE_CHOICE' || question.type === 'MULTI_CHOICE') {
        const counts = question.options.map(() => 0);
        for (const v of vals) for (const i of Array.isArray(v) ? v : [v as number]) if (counts[i] !== undefined) counts[i]++;
        return { question, answered: vals.length, kind: 'choice', counts };
      }
      if (question.type === 'SCALE') {
        const max = question.scaleMax ?? 5;
        const counts = Array.from({ length: max }, () => 0);
        for (const v of vals) counts[(v as number) - 1]++;
        const sum = vals.reduce<number>((t, v) => t + (v as number), 0);
        return { question, answered: vals.length, kind: 'scale', counts, average: vals.length ? Math.round((sum / vals.length) * 100) / 100 : null };
      }
      return { question, answered: vals.length, kind: 'text', samples: (vals as string[]).slice(-50).reverse() };
    });
    const fac = new Map<string, number>();
    const unknown = bi('Not specified', 'ไม่ระบุ');
    for (const r of s.responses) { const f = r.user.faculty ? facultyLabel(r.user.faculty) : unknown; fac.set(f, (fac.get(f) ?? 0) + 1); }
    return {
      id: s.id, title: s.title, responses: s.responses.length, questions,
      byFaculty: [...fac].map(([faculty, count]) => ({ faculty, count })).sort((a, b) => b.count - a.count),
    };
  }

  /** CSV สำหรับเปิดใน Excel (มี BOM ให้แสดงภาษาไทยถูกต้อง) */
  async csv(id: string, viewer: { id: string; role: string }, lang: Lang = 'en') {
    const s = await this.ownedWithResponses(id, viewer);
    const esc = (v: unknown) => {
      const str = v === null || v === undefined ? '' : String(v);
      return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const ext = s.mode === 'EXTERNAL';
    const th = lang === 'th';
    const header = [th ? 'ลำดับ' : 'No.', th ? 'เวลาที่ตอบ' : 'Answered at', th ? 'คณะ' : 'Faculty', th ? 'ชั้นปี' : 'Year', ...(ext ? [th ? 'รหัสอ้างอิง' : 'Reference code'] : []), ...s.questions.map((q, i) => `Q${i + 1}. ${q.title}`)];
    const rows = s.responses.map((r, i) => {
      const a = (r.answers ?? {}) as Answers;
      return [
        i + 1, fmtDMYTime(r.createdAt), r.user.faculty ? pick(facultyLabel(r.user.faculty), lang) : '', r.user.studyYear ?? '', ...(ext ? [refCodeOf(s.id, r.userId)] : []),
        ...s.questions.map((q) => {
          const v = a[q.id];
          if (v === undefined) return '';
          if (q.type === 'SINGLE_CHOICE') return q.options[v as number] ?? '';
          if (q.type === 'MULTI_CHOICE') return (v as number[]).map((x) => q.options[x]).join(' | ');
          return v;
        }),
      ];
    });
    const body = [header, ...rows].map((row) => row.map(esc).join(',')).join('\r\n');
    return { filename: `tembo-survey-${s.id}.csv`, content: '\uFEFF' + body };
  }
}
