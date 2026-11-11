import { z } from 'zod';

/** กฎ Coin ที่ใช้ทั้ง Frontend และ Backend (ดู docs/coin-rules.md) */
export const COIN_RULES = {
  SIGNUP_BONUS: 100,
} as const;

export const CMU_EMAIL_DOMAIN = 'cmu.ac.th';

export const FACULTIES = [
  'มนุษยศาสตร์', 'ศึกษาศาสตร์', 'วิจิตรศิลป์', 'สังคมศาสตร์', 'วิทยาศาสตร์', 'วิศวกรรมศาสตร์',
  'แพทยศาสตร์', 'เกษตรศาสตร์', 'ทันตแพทยศาสตร์', 'เภสัชศาสตร์', 'เทคนิคการแพทย์', 'พยาบาลศาสตร์',
  'อุตสาหกรรมเกษตร', 'สัตวแพทยศาสตร์', 'บริหารธุรกิจ', 'เศรษฐศาสตร์', 'สถาปัตยกรรมศาสตร์',
  'การสื่อสารมวลชน', 'รัฐศาสตร์และรัฐประศาสนศาสตร์', 'นิติศาสตร์', 'สาธารณสุขศาสตร์',
  'วิทยาลัยศิลปะ สื่อ และเทคโนโลยี', 'อื่น ๆ',
] as const;

export const INTERESTS = [
  'เทคโนโลยี', 'สุขภาพ', 'ธุรกิจ', 'ศิลปะและการออกแบบ', 'การศึกษา', 'สิ่งแวดล้อม',
  'กีฬา', 'ดนตรี', 'อาสาสมัคร', 'สังคมและวัฒนธรรม', 'วิทยาศาสตร์', 'อาหาร',
] as const;

const email = z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง').max(254);
const otpCode = z.string().trim().regex(/^\d{6}$/, 'รหัส OTP ต้องเป็นตัวเลข 6 หลัก');

export const requestOtpSchema = z.object({ email });
export const verifyOtpSchema = z.object({
  email,
  code: otpCode,
  referralCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/).optional(),
});
export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(50),
  faculty: z.enum(FACULTIES),
  studyYear: z.number().int().min(1).max(8),
  interests: z.array(z.enum(INTERESTS)).min(1, 'เลือกอย่างน้อย 1 ความสนใจ').max(12),
});
export const requestCmuEmailSchema = z.object({
  cmuEmail: email.refine((e) => e.endsWith(`@${CMU_EMAIL_DOMAIN}`), 'ต้องเป็นอีเมล @cmu.ac.th'),
});
export const verifyCmuEmailSchema = z.object({ code: otpCode });

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type RequestCmuEmailInput = z.infer<typeof requestCmuEmailSchema>;
export type VerifyCmuEmailInput = z.infer<typeof verifyCmuEmailSchema>;

export interface MeResponse {
  id: string;
  email: string;
  displayName: string | null;
  faculty: string | null;
  studyYear: number | null;
  interests: string[];
  cmuEmail: string | null;
  cmuVerified: boolean;
  role: 'MEMBER' | 'ADMIN';
  referralCode: string;
  onboarded: boolean;
  balance: number;
  stats: { responses: number; surveysPosted: number; coinEarned: number };
}

// ───────────────────────── แบบสอบถาม + Escrow (ขั้นที่ 2) ─────────────────────────

export interface SurveyBand { maxQuestions: number; minReward: number; suggestedReward: number; postFee: number }

/** ตารางรางวัลขั้นต่ำ/ค่าแนะนำ/ค่าโพสต์ ตามจำนวนข้อ (docs/coin-rules.md ข้อ 1) */
export const SURVEY_BANDS: readonly SurveyBand[] = [
  { maxQuestions: 10, minReward: 2, suggestedReward: 5, postFee: 10 },
  { maxQuestions: 20, minReward: 4, suggestedReward: 10, postFee: 20 },
  { maxQuestions: 30, minReward: 6, suggestedReward: 15, postFee: 30 },
  { maxQuestions: 40, minReward: 8, suggestedReward: 20, postFee: 40 },
  { maxQuestions: 50, minReward: 10, suggestedReward: 25, postFee: 50 },
];

export const SURVEY_RULES = {
  MAX_QUESTIONS: 50,
  MAX_REWARD: 1000,
  MAX_QUOTA: 1000,
  MAX_DURATION_DAYS: 60,
  /** ระบบสมทบช่วงเปิดตัว (ข้อ 2) */
  SUBSIDY_MAX_SURVEYS: 50,
  SUBSIDY_MAX_AMOUNT: 100,
} as const;

export function surveyBand(questionCount: number): SurveyBand | null {
  if (!Number.isInteger(questionCount) || questionCount < 1) return null;
  return SURVEY_BANDS.find((b) => questionCount <= b.maxQuestions) ?? null;
}

export function subsidyFor(targetPool: number) {
  return Math.min(SURVEY_RULES.SUBSIDY_MAX_AMOUNT, Math.floor(targetPool / 2));
}

export interface SurveyQuote {
  band: SurveyBand;
  targetPool: number;
  postFee: number;
  subsidyAmount: number;
  /** ผู้โพสต์ลงได้สูงสุดเท่านี้ (ส่วนที่เหลือให้ระบบ/เพื่อนเติม) */
  maxOwnerContribution: number;
  /** ต้องลงอย่างน้อยพอจ่าย 1 คน */
  minOwnerContribution: number;
}

/** คำนวณค่าใช้จ่ายของแบบสอบถาม — ใช้ทั้งหน้าเว็บ (แสดงผล) และ API (ตัดสินจริง) */
export function quoteSurvey(i: { questionCount: number; rewardPerResponse: number; quota: number; isFirstPost: boolean; withSubsidy: boolean }): SurveyQuote | null {
  const band = surveyBand(i.questionCount);
  if (!band) return null;
  const targetPool = i.rewardPerResponse * i.quota;
  const subsidyAmount = i.withSubsidy ? subsidyFor(targetPool) : 0;
  return {
    band,
    targetPool,
    postFee: i.isFirstPost ? 0 : band.postFee,
    subsidyAmount,
    maxOwnerContribution: targetPool - subsidyAmount,
    minOwnerContribution: Math.min(i.rewardPerResponse, targetPool - subsidyAmount),
  };
}

const coin = (max: number) => z.number({ invalid_type_error: 'ต้องเป็นตัวเลข' }).int('ต้องเป็นจำนวนเต็ม').min(1).max(max);

// ───────────────────────── คำถาม / คำตอบ (ขั้นที่ 3) ─────────────────────────

export const QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'SHORT_TEXT', 'LONG_TEXT', 'SCALE'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: 'เลือกได้ 1 ข้อ',
  MULTI_CHOICE: 'เลือกได้หลายข้อ',
  SHORT_TEXT: 'ข้อความสั้น',
  LONG_TEXT: 'ข้อความยาว',
  SCALE: 'มาตรวัด (คะแนน)',
};
export const QUESTION_RULES = { MAX_OPTIONS: 10, SCALES: [5, 7, 10] as const, SHORT_TEXT_MAX: 300, LONG_TEXT_MAX: 3000 };
export const isChoice = (t: QuestionType) => t === 'SINGLE_CHOICE' || t === 'MULTI_CHOICE';

export const questionInputSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  title: z.string().trim().min(1, 'กรอกคำถาม').max(300),
  required: z.boolean().default(true),
  options: z.array(z.string().trim().min(1, 'ตัวเลือกห้ามว่าง').max(200)).max(QUESTION_RULES.MAX_OPTIONS).default([]),
  scaleMax: z.number().int().optional(),
  minLabel: z.string().trim().max(50).optional(),
  maxLabel: z.string().trim().max(50).optional(),
}).superRefine((q, ctx) => {
  if (isChoice(q.type) && q.options.length < 2) ctx.addIssue({ code: 'custom', path: ['options'], message: 'คำถามแบบเลือกตอบต้องมีอย่างน้อย 2 ตัวเลือก' });
  if (isChoice(q.type) && new Set(q.options).size !== q.options.length) ctx.addIssue({ code: 'custom', path: ['options'], message: 'ตัวเลือกซ้ำกัน' });
  if (q.type === 'SCALE' && !QUESTION_RULES.SCALES.includes(q.scaleMax as 5)) ctx.addIssue({ code: 'custom', path: ['scaleMax'], message: 'มาตรวัดต้องเป็น 5, 7 หรือ 10 คะแนน' });
});
export type QuestionInput = z.infer<typeof questionInputSchema>;

export interface Question {
  id: string;
  order: number;
  type: QuestionType;
  title: string;
  required: boolean;
  options: string[];
  scaleMax: number | null;
  minLabel: string | null;
  maxLabel: string | null;
}

/** คำตอบต่อข้อ: เลือก 1 ข้อ = index, เลือกหลายข้อ = index[], ข้อความ = string, มาตรวัด = 1..scaleMax */
export type AnswerValue = number | number[] | string;
export type Answers = Record<string, AnswerValue>;

export const submitAnswersSchema = z.object({
  answers: z.record(z.string(), z.union([z.number().int(), z.array(z.number().int()).max(QUESTION_RULES.MAX_OPTIONS), z.string().max(QUESTION_RULES.LONG_TEXT_MAX)])),
});
export type SubmitAnswersInput = z.infer<typeof submitAnswersSchema>;

const isBlank = (v: AnswerValue | undefined) => v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);

/**
 * ตรวจคำตอบเทียบกับคำถาม — คืน { questionId: ข้อความผิดพลาด } (ว่าง = ผ่าน)
 * ใช้ทั้งหน้าเว็บ (แจ้งก่อนส่ง) และ API (ตัดสินจริง) และคืนคำตอบที่ทำความสะอาดแล้ว
 */
export function validateAnswers(questions: Pick<Question, 'id' | 'type' | 'required' | 'options' | 'scaleMax'>[], answers: Answers) {
  const errors: Record<string, string> = {};
  const clean: Answers = {};
  const known = new Set(questions.map((q) => q.id));
  for (const key of Object.keys(answers)) if (!known.has(key)) errors[key] = 'ไม่มีคำถามนี้';
  for (const q of questions) {
    const v = answers[q.id];
    if (isBlank(v)) { if (q.required) errors[q.id] = 'ต้องตอบข้อนี้'; continue; }
    switch (q.type) {
      case 'SINGLE_CHOICE':
        if (typeof v !== 'number' || v < 0 || v >= q.options.length) errors[q.id] = 'เลือกตัวเลือกที่มีอยู่';
        else clean[q.id] = v;
        break;
      case 'MULTI_CHOICE': {
        const arr = Array.isArray(v) ? [...new Set(v)].sort((a, b) => a - b) : null;
        if (!arr || arr.some((i) => i < 0 || i >= q.options.length)) errors[q.id] = 'เลือกตัวเลือกที่มีอยู่';
        else clean[q.id] = arr;
        break;
      }
      case 'SHORT_TEXT':
      case 'LONG_TEXT': {
        const max = q.type === 'SHORT_TEXT' ? QUESTION_RULES.SHORT_TEXT_MAX : QUESTION_RULES.LONG_TEXT_MAX;
        if (typeof v !== 'string') errors[q.id] = 'ต้องเป็นข้อความ';
        else if (v.trim().length > max) errors[q.id] = `ยาวได้ไม่เกิน ${max} ตัวอักษร`;
        else clean[q.id] = v.trim();
        break;
      }
      case 'SCALE':
        if (typeof v !== 'number' || v < 1 || v > (q.scaleMax ?? 5)) errors[q.id] = `ให้คะแนน 1–${q.scaleMax ?? 5}`;
        else clean[q.id] = v;
        break;
    }
  }
  return { ok: Object.keys(errors).length === 0, errors, clean };
}

export const createSurveySchema = z.object({
  title: z.string().trim().min(3, 'ชื่ออย่างน้อย 3 ตัวอักษร').max(150),
  description: z.string().trim().max(2000).optional(),
  questions: z.array(questionInputSchema).min(1, 'ต้องมีอย่างน้อย 1 คำถาม').max(SURVEY_RULES.MAX_QUESTIONS, `ไม่เกิน ${SURVEY_RULES.MAX_QUESTIONS} คำถาม`),
  rewardPerResponse: coin(SURVEY_RULES.MAX_REWARD),
  quota: coin(SURVEY_RULES.MAX_QUOTA),
  closesAt: z.coerce.date(),
  ownerContribution: z.number().int().min(0),
  requestSubsidy: z.boolean().default(false),
}).superRefine((v, ctx) => {
  const n = v.questions.length;
  const band = surveyBand(n);
  if (band && v.rewardPerResponse < band.minReward) {
    ctx.addIssue({ code: 'custom', path: ['rewardPerResponse'], message: `แบบสอบถาม ${n} ข้อ ต้องให้รางวัลอย่างน้อย ${band.minReward} Coin/คน` });
  }
  const now = Date.now();
  if (v.closesAt.getTime() < now + 60 * 60_000) {
    ctx.addIssue({ code: 'custom', path: ['closesAt'], message: 'วันปิดรับต้องอยู่ในอนาคตอย่างน้อย 1 ชั่วโมง' });
  }
  if (v.closesAt.getTime() > now + SURVEY_RULES.MAX_DURATION_DAYS * 86_400_000) {
    ctx.addIssue({ code: 'custom', path: ['closesAt'], message: `เปิดรับได้ไม่เกิน ${SURVEY_RULES.MAX_DURATION_DAYS} วัน` });
  }
});
export const sponsorSurveySchema = z.object({ amount: coin(100_000) });
export const reviewSubsidySchema = z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() });

export type CreateSurveyInput = z.infer<typeof createSurveySchema>;
export type SponsorSurveyInput = z.infer<typeof sponsorSurveySchema>;
export type ReviewSubsidyInput = z.infer<typeof reviewSubsidySchema>;

export type SurveyStatus = 'PENDING_REVIEW' | 'OPEN' | 'CLOSED';
export type SubsidyStatus = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface SurveySummary {
  id: string;
  isMine: boolean;
  title: string;
  ownerName: string | null;
  ownerFaculty: string | null;
  questionCount: number;
  rewardPerResponse: number;
  quota: number;
  responsesCount: number;
  status: SurveyStatus;
  closesAt: string;
  /** จ่ายได้อีกกี่คนจาก Coin ที่อยู่ใน Escrow ตอนนี้ */
  payableResponses: number;
}

export interface SurveyDetail extends SurveySummary {
  description: string | null;
  targetPool: number;
  postFee: number;
  escrowBalance: number;
  subsidyStatus: SubsidyStatus;
  subsidyAmount: number;
  subsidyNote: string | null;
  funded: { owner: number; system: number; sponsors: number; sponsorCount: number };
  /** ยังสนับสนุนเพิ่มได้อีกเท่าไร */
  remainingToFund: number;
  isOwner: boolean;
  myContribution: number;
  hasResponded: boolean;
  canRespond: boolean;
  /** เหตุผลที่ตอบไม่ได้ (ถ้ามี) */
  respondBlockedReason: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface SurveyQuoteResponse { isFirstPost: boolean; subsidy: { eligible: boolean; reason: string | null; remainingSlots: number } }

export interface SurveyForm {
  id: string;
  title: string;
  description: string | null;
  rewardPerResponse: number;
  questions: Question[];
}

export type QuestionResult =
  | { question: Question; answered: number; kind: 'choice'; counts: number[] }
  | { question: Question; answered: number; kind: 'scale'; counts: number[]; average: number | null }
  | { question: Question; answered: number; kind: 'text'; samples: string[] };

export interface SurveyResults {
  id: string;
  title: string;
  responses: number;
  questions: QuestionResult[];
  byFaculty: { faculty: string; count: number }[];
}
