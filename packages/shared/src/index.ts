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

export const createSurveySchema = z.object({
  title: z.string().trim().min(3, 'ชื่ออย่างน้อย 3 ตัวอักษร').max(150),
  description: z.string().trim().max(2000).optional(),
  questionCount: coin(SURVEY_RULES.MAX_QUESTIONS),
  rewardPerResponse: coin(SURVEY_RULES.MAX_REWARD),
  quota: coin(SURVEY_RULES.MAX_QUOTA),
  closesAt: z.coerce.date(),
  ownerContribution: z.number().int().min(0),
  requestSubsidy: z.boolean().default(false),
}).superRefine((v, ctx) => {
  const band = surveyBand(v.questionCount);
  if (band && v.rewardPerResponse < band.minReward) {
    ctx.addIssue({ code: 'custom', path: ['rewardPerResponse'], message: `แบบสอบถาม ${v.questionCount} ข้อ ต้องให้รางวัลอย่างน้อย ${band.minReward} Coin/คน` });
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
  title: string;
  ownerName: string | null;
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
