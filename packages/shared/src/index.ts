import { z } from 'zod';

// ───────────────────────── ภาษา (EN / TH) ─────────────────────────
// ข้อความที่สร้างจากเซิร์ฟเวอร์ (error, แจ้งเตือน, ป้าย) เก็บทั้ง 2 ภาษาในสตริงเดียวด้วย bi()
// แล้วเลือกภาษาตอนส่งออกด้วย pick() ตาม cookie tembo_lang (ค่าเริ่มต้น = อังกฤษ)

export const LANGS = ['en', 'th'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'en';
export const LANG_COOKIE = 'tembo_lang';
const BI_SEP = '\u241E';

/** ข้อความ 2 ภาษา */
export const bi = (en: string, th: string) => `${en}${BI_SEP}${th}`;
export const isBi = (s: string) => s.includes(BI_SEP);
export const asLang = (v: unknown): Lang => (v === 'th' ? 'th' : 'en');

/** เลือกภาษาจากข้อความ bi() — ข้อความธรรมดาคืนตามเดิม */
export function pick(s: string, lang: Lang): string {
  const i = s.indexOf(BI_SEP);
  if (i < 0) return s;
  return lang === 'th' ? s.slice(i + BI_SEP.length) : s.slice(0, i);
}

/** pick() ทุกสตริงในอ็อบเจ็กต์/อาร์เรย์ (ใช้กับผลลัพธ์ API ทั้งก้อน) */
export function pickDeep<T>(v: T, lang: Lang): T {
  if (typeof v === 'string') return (isBi(v) ? pick(v, lang) : v) as T;
  if (Array.isArray(v)) return v.map((x) => pickDeep(x, lang)) as T;
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = pickDeep(x, lang);
    return out as T;
  }
  return v;
}

/** วันที่แบบ dd/mm/yyyy (ค.ศ., เวลาไทย) ทั้ง 2 ภาษา */
const DMY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' });
const HM = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export const fmtDMY = (d: Date | string) => DMY.format(new Date(d));
export const fmtDMYTime = (d: Date | string) => `${fmtDMY(d)} ${HM.format(new Date(d))}`;


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

/** ชื่อคณะ/ความสนใจเก็บในฐานข้อมูลเป็นภาษาไทย — แสดงผลภาษาอังกฤษด้วยตารางนี้ */
export const FACULTY_EN: Record<(typeof FACULTIES)[number], string> = {
  'มนุษยศาสตร์': 'Humanities', 'ศึกษาศาสตร์': 'Education', 'วิจิตรศิลป์': 'Fine Arts', 'สังคมศาสตร์': 'Social Sciences',
  'วิทยาศาสตร์': 'Science', 'วิศวกรรมศาสตร์': 'Engineering', 'แพทยศาสตร์': 'Medicine', 'เกษตรศาสตร์': 'Agriculture',
  'ทันตแพทยศาสตร์': 'Dentistry', 'เภสัชศาสตร์': 'Pharmacy', 'เทคนิคการแพทย์': 'Associated Medical Sciences', 'พยาบาลศาสตร์': 'Nursing',
  'อุตสาหกรรมเกษตร': 'Agro-Industry', 'สัตวแพทยศาสตร์': 'Veterinary Medicine', 'บริหารธุรกิจ': 'Business Administration',
  'เศรษฐศาสตร์': 'Economics', 'สถาปัตยกรรมศาสตร์': 'Architecture', 'การสื่อสารมวลชน': 'Mass Communication',
  'รัฐศาสตร์และรัฐประศาสนศาสตร์': 'Political Science and Public Administration', 'นิติศาสตร์': 'Law', 'สาธารณสุขศาสตร์': 'Public Health',
  'วิทยาลัยศิลปะ สื่อ และเทคโนโลยี': 'College of Arts, Media and Technology', 'อื่น ๆ': 'Other',
};
export const INTEREST_EN: Record<(typeof INTERESTS)[number], string> = {
  'เทคโนโลยี': 'Technology', 'สุขภาพ': 'Health', 'ธุรกิจ': 'Business', 'ศิลปะและการออกแบบ': 'Art & Design', 'การศึกษา': 'Education',
  'สิ่งแวดล้อม': 'Environment', 'กีฬา': 'Sports', 'ดนตรี': 'Music', 'อาสาสมัคร': 'Volunteering', 'สังคมและวัฒนธรรม': 'Society & Culture',
  'วิทยาศาสตร์': 'Science', 'อาหาร': 'Food',
};
/** ชื่อคณะ 2 ภาษา (ค่าที่ไม่รู้จักคืนตามเดิม) */
export const facultyLabel = (v: string) => (v in FACULTY_EN ? bi(FACULTY_EN[v as keyof typeof FACULTY_EN], v) : v);
export const interestLabel = (v: string) => (v in INTEREST_EN ? bi(INTEREST_EN[v as keyof typeof INTEREST_EN], v) : v);

// ข้อความ error พื้นฐานของ zod เป็น 2 ภาษา (ข้อความที่กำหนดเองใช้ bi() ตรง ๆ)
z.setErrorMap((issue, ctx) => {
  const th = (() => {
    switch (issue.code) {
      case 'invalid_type': return issue.received === 'undefined' ? 'จำเป็นต้องกรอก' : 'รูปแบบข้อมูลไม่ถูกต้อง';
      case 'too_small': return issue.type === 'string' ? `ต้องมีอย่างน้อย ${issue.minimum} ตัวอักษร` : issue.type === 'array' ? `ต้องเลือกอย่างน้อย ${issue.minimum} รายการ` : `ต้องไม่น้อยกว่า ${issue.minimum}`;
      case 'too_big': return issue.type === 'string' ? `ยาวได้ไม่เกิน ${issue.maximum} ตัวอักษร` : issue.type === 'array' ? `เลือกได้ไม่เกิน ${issue.maximum} รายการ` : `ต้องไม่เกิน ${issue.maximum}`;
      case 'invalid_enum_value': return 'กรุณาเลือกจากรายการ';
      case 'invalid_string': return 'รูปแบบไม่ถูกต้อง';
      case 'invalid_date': return 'วันที่ไม่ถูกต้อง';
      default: return 'ข้อมูลไม่ถูกต้อง';
    }
  })();
  return { message: bi(ctx.defaultError, th) };
});

const email = z.string().trim().toLowerCase().email(bi('Invalid email address', 'อีเมลไม่ถูกต้อง')).max(254);
/** ลิงก์ https เท่านั้น */
export const httpsUrlSchema = z.string().trim().max(500).url(bi('Invalid link', 'ลิงก์ไม่ถูกต้อง')).refine((u) => u.startsWith('https://'), bi('Link must start with https://', 'ลิงก์ต้องขึ้นต้นด้วย https://'));
const otpCode = z.string().trim().regex(/^\d{6}$/, bi('The code must be 6 digits', 'รหัส OTP ต้องเป็นตัวเลข 6 หลัก'));

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
  interests: z.array(z.enum(INTERESTS)).min(1, bi('Choose at least 1 interest', 'เลือกอย่างน้อย 1 ความสนใจ')).max(12),
});
export const requestCmuEmailSchema = z.object({
  cmuEmail: email.refine((e) => e.endsWith(`@${CMU_EMAIL_DOMAIN}`), bi('Must be a @cmu.ac.th email', 'ต้องเป็นอีเมล @cmu.ac.th')),
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
  stats: { responses: number; surveysPosted: number; coinEarned: number; eventsJoined: number; eventsCheckedIn: number };
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
export function quoteSurvey(i: { questionCount: number; rewardPerResponse: number; quota: number; isFirstPost: boolean; withSubsidy: boolean; prizes?: number[] }): SurveyQuote | null {
  const band = surveyBand(i.questionCount);
  if (!band) return null;
  const draw = !!i.prizes?.length;
  // สุ่มจับรางวัล: ยอดรวม = ผลรวมรางวัลทุกอันดับ และต้องลงครบตั้งแต่แรก (ไม่รอเพื่อนเติม)
  const targetPool = draw ? i.prizes!.reduce((a, b) => a + b, 0) : i.rewardPerResponse * i.quota;
  const subsidyAmount = i.withSubsidy ? subsidyFor(targetPool) : 0;
  return {
    band,
    targetPool,
    postFee: i.isFirstPost ? 0 : band.postFee,
    subsidyAmount,
    maxOwnerContribution: targetPool - subsidyAmount,
    minOwnerContribution: draw ? targetPool - subsidyAmount : Math.min(i.rewardPerResponse, targetPool - subsidyAmount),
  };
}

const coin = (max: number) => z.number({ invalid_type_error: bi('Must be a number', 'ต้องเป็นตัวเลข') }).int(bi('Must be a whole number', 'ต้องเป็นจำนวนเต็ม')).min(1).max(max);

// ───────────────────────── คำถาม / คำตอบ (ขั้นที่ 3) ─────────────────────────

export const QUESTION_TYPES = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'SHORT_TEXT', 'LONG_TEXT', 'SCALE'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];
export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE_CHOICE: bi('Single choice', 'เลือกได้ 1 ข้อ'),
  MULTI_CHOICE: bi('Multiple choice', 'เลือกได้หลายข้อ'),
  SHORT_TEXT: bi('Short text', 'ข้อความสั้น'),
  LONG_TEXT: bi('Long text', 'ข้อความยาว'),
  SCALE: bi('Rating scale', 'มาตรวัด (คะแนน)'),
};
export const QUESTION_RULES = { MAX_OPTIONS: 10, SCALES: [5, 7, 10] as const, SHORT_TEXT_MAX: 300, LONG_TEXT_MAX: 3000 };
export const isChoice = (t: QuestionType) => t === 'SINGLE_CHOICE' || t === 'MULTI_CHOICE';

export const questionInputSchema = z.object({
  type: z.enum(QUESTION_TYPES),
  title: z.string().trim().min(1, bi('Enter the question', 'กรอกคำถาม')).max(300),
  required: z.boolean().default(true),
  options: z.array(z.string().trim().min(1, bi('Options cannot be empty', 'ตัวเลือกห้ามว่าง')).max(200)).max(QUESTION_RULES.MAX_OPTIONS).default([]),
  scaleMax: z.number().int().optional(),
  minLabel: z.string().trim().max(50).optional(),
  maxLabel: z.string().trim().max(50).optional(),
}).superRefine((q, ctx) => {
  if (isChoice(q.type) && q.options.length < 2) ctx.addIssue({ code: 'custom', path: ['options'], message: bi('Choice questions need at least 2 options', 'คำถามแบบเลือกตอบต้องมีอย่างน้อย 2 ตัวเลือก') });
  if (isChoice(q.type) && new Set(q.options).size !== q.options.length) ctx.addIssue({ code: 'custom', path: ['options'], message: bi('Options must be unique', 'ตัวเลือกซ้ำกัน') });
  if (q.type === 'SCALE' && !QUESTION_RULES.SCALES.includes(q.scaleMax as 5)) ctx.addIssue({ code: 'custom', path: ['scaleMax'], message: bi('Scale must be 5, 7 or 10 points', 'มาตรวัดต้องเป็น 5, 7 หรือ 10 คะแนน') });
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
  for (const key of Object.keys(answers)) if (!known.has(key)) errors[key] = bi('Unknown question', 'ไม่มีคำถามนี้');
  for (const q of questions) {
    const v = answers[q.id];
    if (isBlank(v)) { if (q.required) errors[q.id] = bi('This question is required', 'ต้องตอบข้อนี้'); continue; }
    switch (q.type) {
      case 'SINGLE_CHOICE':
        if (typeof v !== 'number' || v < 0 || v >= q.options.length) errors[q.id] = bi('Choose one of the options', 'เลือกตัวเลือกที่มีอยู่');
        else clean[q.id] = v;
        break;
      case 'MULTI_CHOICE': {
        const arr = Array.isArray(v) ? [...new Set(v)].sort((a, b) => a - b) : null;
        if (!arr || arr.some((i) => i < 0 || i >= q.options.length)) errors[q.id] = bi('Choose one of the options', 'เลือกตัวเลือกที่มีอยู่');
        else clean[q.id] = arr;
        break;
      }
      case 'SHORT_TEXT':
      case 'LONG_TEXT': {
        const max = q.type === 'SHORT_TEXT' ? QUESTION_RULES.SHORT_TEXT_MAX : QUESTION_RULES.LONG_TEXT_MAX;
        if (typeof v !== 'string') errors[q.id] = bi('Must be text', 'ต้องเป็นข้อความ');
        else if (v.trim().length > max) errors[q.id] = bi(`Up to ${max} characters`, `ยาวได้ไม่เกิน ${max} ตัวอักษร`);
        else clean[q.id] = v.trim();
        break;
      }
      case 'SCALE':
        if (typeof v !== 'number' || v < 1 || v > (q.scaleMax ?? 5)) errors[q.id] = bi(`Rate 1–${q.scaleMax ?? 5}`, `ให้คะแนน 1–${q.scaleMax ?? 5}`);
        else clean[q.id] = v;
        break;
    }
  }
  return { ok: Object.keys(errors).length === 0, errors, clean };
}

export const SURVEY_MODES = ['IN_APP', 'EXTERNAL'] as const;
export type SurveyMode = (typeof SURVEY_MODES)[number];

/** แบบสอบถามลิงก์ภายนอก (ขั้นที่ 4.5) */
export const EXTERNAL_SURVEY_RULES = {
  /** ต้องเปิดฟอร์มก่อนกี่วินาทีจึงกรอกรหัสยืนยันได้ */
  MIN_SECONDS: 30,
  /** กรอกรหัสผิดได้กี่ครั้ง */
  MAX_ATTEMPTS: 5,
} as const;

/** หมวดของแบบสอบถาม (Figma: Create Information → Category) */
export const SURVEY_CATEGORIES = {
  EDUCATION: bi('Education', 'การศึกษา'), HEALTH: bi('Health', 'สุขภาพ'), TECHNOLOGY: bi('Technology', 'เทคโนโลยี'),
  SOCIAL: bi('Society & Behavior', 'สังคมและพฤติกรรม'), BUSINESS: bi('Business & Marketing', 'ธุรกิจและการตลาด'),
  ENVIRONMENT: bi('Environment', 'สิ่งแวดล้อม'), ARTS: bi('Art & Design', 'ศิลปะและการออกแบบ'), OTHER: bi('Other', 'อื่น ๆ'),
} as const;
export type SurveyCategory = keyof typeof SURVEY_CATEGORIES;
const CATEGORY_KEYS = Object.keys(SURVEY_CATEGORIES) as [SurveyCategory, ...SurveyCategory[]];

/** เวลาทำโดยประมาณ — เก็บค่าสูงสุดของช่วงเป็นนาที */
export const EST_MINUTES = [
  { value: 3, label: bi('Under 3 min', 'ไม่เกิน 3 นาที') }, { value: 5, label: bi('3–5 min', '3–5 นาที') }, { value: 10, label: bi('5–10 min', '5–10 นาที') },
  { value: 15, label: bi('10–15 min', '10–15 นาที') }, { value: 30, label: bi('15–30 min', '15–30 นาที') }, { value: 60, label: bi('Over 30 min', 'มากกว่า 30 นาที') },
] as const;
export const estMinutesLabel = (m: number | null | undefined) => EST_MINUTES.find((e) => e.value === m)?.label ?? null;

export const STUDY_YEARS = [1, 2, 3, 4, 5, 6] as const;

export const REWARD_MODES = ['EQUAL', 'DRAW'] as const;
export type RewardMode = (typeof REWARD_MODES)[number];
export const REWARD_MODE_LABEL: Record<RewardMode, string> = { EQUAL: bi('Same for everyone', 'ทุกคนได้เท่ากัน'), DRAW: bi('Lucky draw', 'สุ่มจับรางวัล') };
export const DRAW_RULES = { MAX_PRIZES: 10, MAX_PRIZE: 10_000 } as const;

/** วิธีตรวจว่าส่งฟอร์มภายนอกแล้ว: CODE = รหัสเดียวหน้าขอบคุณ (แบบเก่า), SCRIPT = Apps Script ส่งผลอัตโนมัติ */
export const EXTERNAL_VERIFY = ['CODE', 'SCRIPT'] as const;
export type ExternalVerify = (typeof EXTERNAL_VERIFY)[number];

/** สคริปต์ใช้คำนี้สร้างลิงก์กรอกล่วงหน้า เพื่อบอก TEMBO ว่าช่องรหัสคือ entry ไหน */
export const PREFILL_PLACEHOLDER = 'TEMBO';
/** รหัส TEMBO เฉพาะผู้ตอบ เช่น TB7K2M9QXA */
export const TEMBO_CODE_RE = /^TB[A-Z0-9]{8}$/;

/** ลิงก์ Google Form ทั่วไป: docs.google.com/forms/… หรือ forms.gle/… (ไม่ต้องมีอะไรพิเศษ) */
export function isGoogleFormUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return false; }
  if (u.protocol !== 'https:') return false;
  if (u.hostname === 'forms.gle') return u.pathname.length > 1;
  return u.hostname === 'docs.google.com' && /^\/forms\/(u\/\d+\/)?d\//.test(u.pathname);
}

/**
 * แยกลิงก์กรอกล่วงหน้าที่สคริปต์ส่งมา → ลิงก์ฟอร์ม + ชื่อช่อง entry ของคำถามรหัส TEMBO
 * รองรับ https://docs.google.com/forms/d/e/<id>/viewform?usp=pp_url&entry.123=TEMBO
 */
export function parseGoogleFormPrefill(raw: string): { formUrl: string; entryId: string } | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== 'docs.google.com' || !/^\/forms\/(u\/\d+\/)?d\/(e\/)?[\w-]+\/viewform$/.test(u.pathname)) return null;
  const entry = [...u.searchParams.entries()].find(([k, v]) => /^entry\.\d+$/.test(k) && v.trim().toUpperCase() === PREFILL_PLACEHOLDER);
  if (!entry) return null;
  return { formUrl: `${u.origin}${u.pathname}`, entryId: entry[0] };
}

export const createSurveySchema = z.object({
  title: z.string().trim().min(3, bi('Title needs at least 3 characters', 'ชื่ออย่างน้อย 3 ตัวอักษร')).max(150),
  description: z.string().trim().max(2000).optional(),
  mode: z.enum(SURVEY_MODES).default('IN_APP'),
  tags: z.array(z.enum(INTERESTS)).max(5, bi('Choose up to 5 tags', 'เลือกได้ไม่เกิน 5 หัวข้อ')).default([]),
  questions: z.array(questionInputSchema).max(SURVEY_RULES.MAX_QUESTIONS, bi(`Up to ${SURVEY_RULES.MAX_QUESTIONS} questions`, `ไม่เกิน ${SURVEY_RULES.MAX_QUESTIONS} คำถาม`)).default([]),
  /** EXTERNAL เท่านั้น */
  externalUrl: httpsUrlSchema.optional(),
  /** EXTERNAL เท่านั้น: จำนวนข้อในฟอร์มภายนอก (ใช้คิดรางวัลขั้นต่ำและค่าโพสต์) */
  externalQuestionCount: z.number().int().min(1).max(SURVEY_RULES.MAX_QUESTIONS, bi(`Up to ${SURVEY_RULES.MAX_QUESTIONS} questions`, `ไม่เกิน ${SURVEY_RULES.MAX_QUESTIONS} ข้อ`)).optional(),
  rewardPerResponse: coin(SURVEY_RULES.MAX_REWARD),
  quota: coin(SURVEY_RULES.MAX_QUOTA),
  closesAt: z.coerce.date(),
  ownerContribution: z.number().int().min(0),
  requestSubsidy: z.boolean().default(false),
  category: z.enum(CATEGORY_KEYS).optional(),
  estMinutes: z.number().int().refine((m) => EST_MINUTES.some((e) => e.value === m), bi('Choose a completion time from the list', 'เลือกเวลาทำจากรายการ')).optional(),
  eligibleFaculties: z.array(z.enum(FACULTIES)).max(FACULTIES.length).default([]),
  eligibleYears: z.array(z.number().int().min(1).max(8)).max(8).default([]),
  rewardMode: z.enum(REWARD_MODES).default('EQUAL'),
  /** DRAW: รางวัลอันดับ 1, 2, 3, … */
  prizes: z.array(z.number().int().min(1).max(DRAW_RULES.MAX_PRIZE)).max(DRAW_RULES.MAX_PRIZES, bi(`Up to ${DRAW_RULES.MAX_PRIZES} prizes`, `ไม่เกิน ${DRAW_RULES.MAX_PRIZES} รางวัล`)).default([]),
  /** EXTERNAL: วิธีตรวจการส่ง */
  externalVerify: z.enum(EXTERNAL_VERIFY).default('CODE'),
}).superRefine((v, ctx) => {
  if (v.mode === 'EXTERNAL' && v.externalVerify === 'SCRIPT' && v.externalUrl && !isGoogleFormUrl(v.externalUrl)) {
    ctx.addIssue({ code: 'custom', path: ['externalUrl'], message: bi('Please enter your Google Form link', 'กรุณากรอกลิงก์ Google Form ของคุณ') });
  }
  if (v.rewardMode === 'DRAW') {
    const band = surveyBand(surveyQuestionCount(v));
    if (!v.prizes.length) ctx.addIssue({ code: 'custom', path: ['prizes'], message: bi('Add at least 1 prize', 'ใส่รางวัลอย่างน้อย 1 รางวัล') });
    if (v.prizes.length > v.quota) ctx.addIssue({ code: 'custom', path: ['prizes'], message: bi('There cannot be more prizes than participants', 'จำนวนรางวัลต้องไม่เกินจำนวนผู้ตอบ') });
    if (band && v.prizes.some((p) => p < band.minReward)) ctx.addIssue({ code: 'custom', path: ['prizes'], message: bi(`Each prize must be at least ${band.minReward} Coin`, `แต่ละรางวัลต้องอย่างน้อย ${band.minReward} Coin`) });
    if (v.rewardPerResponse !== Math.max(0, ...v.prizes)) ctx.addIssue({ code: 'custom', path: ['rewardPerResponse'], message: bi('rewardPerResponse must equal the top prize', 'rewardPerResponse ต้องเท่ากับรางวัลสูงสุด') });
  } else if (v.prizes.length) {
    ctx.addIssue({ code: 'custom', path: ['prizes'], message: bi('Prizes are only for lucky draws', 'ใส่รางวัลรายอันดับเฉพาะแบบสุ่มจับรางวัล') });
  }
  if (v.mode === 'IN_APP' && v.questions.length < 1) ctx.addIssue({ code: 'custom', path: ['questions'], message: bi('Add at least 1 question', 'ต้องมีอย่างน้อย 1 คำถาม') });
  if (v.mode === 'EXTERNAL') {
    if (!v.externalUrl) ctx.addIssue({ code: 'custom', path: ['externalUrl'], message: bi('Please enter your survey link', 'กรุณากรอกลิงก์แบบสอบถามของคุณ') });
    if (!v.externalQuestionCount) ctx.addIssue({ code: 'custom', path: ['externalQuestionCount'], message: bi('Enter the number of questions', 'ระบุจำนวนข้อในแบบสอบถาม') });
    if (v.questions.length) ctx.addIssue({ code: 'custom', path: ['questions'], message: bi('Link surveys do not need questions in TEMBO', 'แบบสอบถามลิงก์ภายนอกไม่ต้องสร้างคำถามใน TEMBO') });
  }
  const n = surveyQuestionCount(v);
  const band = surveyBand(n);
  if (band && v.rewardPerResponse < band.minReward) {
    ctx.addIssue({ code: 'custom', path: ['rewardPerResponse'], message: bi(`A ${n}-question survey needs at least ${band.minReward} Coin per person`, `แบบสอบถาม ${n} ข้อ ต้องให้รางวัลอย่างน้อย ${band.minReward} Coin/คน`) });
  }
  const now = Date.now();
  if (v.closesAt.getTime() < now + 60 * 60_000) {
    ctx.addIssue({ code: 'custom', path: ['closesAt'], message: bi('The closing date must be at least 1 hour from now', 'วันปิดรับต้องอยู่ในอนาคตอย่างน้อย 1 ชั่วโมง') });
  }
  if (v.closesAt.getTime() > now + SURVEY_RULES.MAX_DURATION_DAYS * 86_400_000) {
    ctx.addIssue({ code: 'custom', path: ['closesAt'], message: bi(`Surveys can stay open for up to ${SURVEY_RULES.MAX_DURATION_DAYS} days`, `เปิดรับได้ไม่เกิน ${SURVEY_RULES.MAX_DURATION_DAYS} วัน`) });
  }
});

/** จำนวนข้อที่ใช้คิดรางวัลขั้นต่ำ/ค่าโพสต์ */
export function surveyQuestionCount(v: { mode?: SurveyMode; questions: unknown[]; externalQuestionCount?: number }) {
  return v.mode === 'EXTERNAL' ? v.externalQuestionCount ?? 0 : v.questions.length;
}

export const verifyExternalSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,12}$/, bi('Invalid confirmation code', 'รหัสยืนยันไม่ถูกต้อง')) });
export type VerifyExternalInput = z.infer<typeof verifyExternalSchema>;
export interface ExternalStartResponse {
  url: string; refCode: string; startedAt: string; canVerifyAt: string; attemptsLeft: number;
  /** SCRIPT: รหัส TEMBO ของผู้ตอบ (ใส่ในฟอร์มให้แล้วถ้ามีลิงก์กรอกล่วงหน้า) */
  code: string | null;
  /** SCRIPT: Google Form แจ้งว่าส่งแล้วเมื่อ */
  submittedAt: string | null;
}

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
  mode: SurveyMode;
  title: string;
  description: string | null;
  tags: string[];
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
  /** ผู้ดูตอบแล้วหรือยัง */
  responded: boolean;
  /** ผู้ดูบันทึกไว้หรือไม่ */
  saved: boolean;
  createdAt: string;
  category: SurveyCategory | null;
  estMinutes: number | null;
  eligibleFaculties: string[];
  eligibleYears: number[];
  rewardMode: RewardMode;
  prizes: number[];
  externalVerify: ExternalVerify | null;
}

export interface SurveyDetail extends SurveySummary {
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
  /** เท่ากับ responded (คงไว้ให้หน้าเดิมใช้) */
  hasResponded: boolean;
  canRespond: boolean;
  /** เหตุผลที่ตอบไม่ได้ (ถ้ามี) */
  respondBlockedReason: string | null;
  closedAt: string | null;
  /** EXTERNAL: ผู้โพสต์เห็นเสมอ / ผู้ตอบเห็นหลังกดเริ่ม */
  externalUrl: string | null;
  /** EXTERNAL: เฉพาะผู้โพสต์ */
  completionCode: string | null;
  /** EXTERNAL: ผู้ตอบเริ่มแล้วหรือยัง */
  myStart: ExternalStartResponse | null;
  /** SCRIPT: เฉพาะผู้โพสต์ — ใช้ติดตั้ง Apps Script ใน Google Form */
  script: { endpoint: string; secret: string; connectedAt: string | null } | null;
  /** DRAW: สุ่มแล้วเมื่อ / อันดับที่ผู้ดูได้ (null = ไม่ได้รางวัลหรือยังไม่สุ่ม) / ผลรางวัลทุกอันดับ */
  drawnAt: string | null;
  myPrizeRank: number | null;
  winners: { rank: number; prize: number; name: string | null }[];
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

// ───────────────────────── Event (ขั้นที่ 4) ─────────────────────────

export const EVENT_CATEGORIES = ['UNIVERSITY', 'FACULTY', 'CLUB'] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];
export const EVENT_CATEGORY_LABEL: Record<EventCategory, string> = { UNIVERSITY: bi('University', 'มหาวิทยาลัย'), FACULTY: bi('Faculty', 'คณะ'), CLUB: bi('Club', 'ชมรม') };

export const EVENT_RULES = {
  /** ค่าโพสต์ Event (ไม่มีสิทธิ์โพสต์แรกฟรี) — คืนให้ถ้าแอดมินไม่อนุมัติหรือยกเลิกก่อนอนุมัติ */
  POST_FEE: 10,
  MAX_REWARD: 100,
  MAX_REWARD_SLOTS: 1000,
  MAX_CAPACITY: 5000,
  MAX_TAGS: 5,
  MAX_DURATION_HOURS: 72,
  MAX_DAYS_AHEAD: 180,
  /** เช็กอินได้ตั้งแต่ก่อนเริ่มงาน … นาที ถึงหลังจบงาน … นาที */
  CHECKIN_OPENS_BEFORE_MIN: 60,
  CHECKIN_CLOSES_AFTER_MIN: 120,
  /** รหัสเช็กอินเปลี่ยนทุก … วินาที (รับรหัสปัจจุบันและรหัสก่อนหน้า 1 รอบ) */
  CHECKIN_CODE_SECONDS: 60,
} as const;

/** Coin ที่ต้องล็อกตอนสร้าง Event = ค่าโพสต์ + รางวัล × จำนวนคนที่ได้รางวัล */
export function quoteEvent(i: { rewardPerCheckIn: number; rewardSlots: number }) {
  const rewardPool = i.rewardPerCheckIn > 0 ? i.rewardPerCheckIn * i.rewardSlots : 0;
  return { postFee: EVENT_RULES.POST_FEE, rewardPool, total: EVENT_RULES.POST_FEE + rewardPool };
}

const optionalUrl = z.union([httpsUrlSchema, z.literal('').transform(() => undefined)]).optional();

export const createEventSchema = z.object({
  title: z.string().trim().min(3, bi('Title needs at least 3 characters', 'ชื่ออย่างน้อย 3 ตัวอักษร')).max(120),
  description: z.string().trim().min(10, bi('Description needs at least 10 characters', 'รายละเอียดอย่างน้อย 10 ตัวอักษร')).max(3000),
  hostName: z.string().trim().min(2, bi('Enter the organizer name', 'กรอกชื่อผู้จัด')).max(80),
  category: z.enum(EVENT_CATEGORIES),
  tags: z.array(z.enum(INTERESTS)).max(EVENT_RULES.MAX_TAGS, bi(`Choose up to ${EVENT_RULES.MAX_TAGS} tags`, `เลือกได้ไม่เกิน ${EVENT_RULES.MAX_TAGS} แท็ก`)).default([]),
  coverUrl: optionalUrl,
  location: z.string().trim().min(2, bi('Enter the location', 'กรอกสถานที่')).max(200),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  capacity: z.number().int().min(1).max(EVENT_RULES.MAX_CAPACITY).nullable().default(null),
  registrationUrl: optionalUrl,
  rewardPerCheckIn: z.number().int().min(0).max(EVENT_RULES.MAX_REWARD).default(0),
  rewardSlots: z.number().int().min(0).max(EVENT_RULES.MAX_REWARD_SLOTS).default(0),
}).superRefine((v, ctx) => {
  const now = Date.now();
  if (v.startsAt.getTime() < now + 60 * 60_000) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: bi('The start time must be at least 1 hour from now', 'เวลาเริ่มต้องอยู่ในอนาคตอย่างน้อย 1 ชั่วโมง') });
  if (v.startsAt.getTime() > now + EVENT_RULES.MAX_DAYS_AHEAD * 86_400_000) ctx.addIssue({ code: 'custom', path: ['startsAt'], message: bi(`Events can be posted up to ${EVENT_RULES.MAX_DAYS_AHEAD} days ahead`, `โพสต์ล่วงหน้าได้ไม่เกิน ${EVENT_RULES.MAX_DAYS_AHEAD} วัน`) });
  if (v.endsAt <= v.startsAt) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: bi('The end time must be after the start time', 'เวลาจบต้องหลังเวลาเริ่ม') });
  else if (v.endsAt.getTime() - v.startsAt.getTime() > EVENT_RULES.MAX_DURATION_HOURS * 3_600_000) ctx.addIssue({ code: 'custom', path: ['endsAt'], message: bi(`Events can last up to ${EVENT_RULES.MAX_DURATION_HOURS} hours`, `งานยาวได้ไม่เกิน ${EVENT_RULES.MAX_DURATION_HOURS} ชั่วโมง`) });
  if (v.rewardPerCheckIn > 0) {
    if (v.rewardSlots < 1) ctx.addIssue({ code: 'custom', path: ['rewardSlots'], message: bi('Enter how many people get the reward', 'ระบุจำนวนคนที่ได้รางวัล') });
    if (v.capacity !== null && v.rewardSlots > v.capacity) ctx.addIssue({ code: 'custom', path: ['rewardSlots'], message: bi('Reward slots cannot exceed capacity', 'จำนวนคนที่ได้รางวัลต้องไม่เกินจำนวนที่รับ') });
  } else if (v.rewardSlots > 0) ctx.addIssue({ code: 'custom', path: ['rewardPerCheckIn'], message: bi('Set Coin per person, or set reward slots to 0', 'ระบุ Coin ต่อคน หรือตั้งจำนวนคนที่ได้รางวัลเป็น 0') });
});
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const checkInSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, bi('Invalid check-in code', 'รหัสเช็กอินไม่ถูกต้อง')) });
export type CheckInInput = z.infer<typeof checkInSchema>;
export const reviewEventSchema = z.object({ approve: z.boolean(), note: z.string().trim().max(500).optional() });
export type ReviewEventInput = z.infer<typeof reviewEventSchema>;

export type EventStatus = 'PENDING_REVIEW' | 'PUBLISHED' | 'REJECTED' | 'CANCELLED' | 'ENDED';
export type RegistrationStatus = 'REGISTERED' | 'WAITLISTED' | 'CANCELLED';
export const EVENT_FILTERS = ['all', 'UNIVERSITY', 'FACULTY', 'CLUB', 'mine'] as const;
export type EventFilter = (typeof EVENT_FILTERS)[number];

export interface EventSummary {
  id: string;
  title: string;
  hostName: string;
  category: EventCategory;
  tags: string[];
  coverUrl: string | null;
  location: string;
  startsAt: string;
  endsAt: string;
  capacity: number | null;
  registeredCount: number;
  isFull: boolean;
  rewardPerCheckIn: number;
  /** รางวัลเหลืออีกกี่คน */
  rewardsLeft: number;
  status: EventStatus;
  isOrganizer: boolean;
  myStatus: RegistrationStatus | null;
  myCheckedIn: boolean;
  createdAt: string;
}

export interface EventDetail extends EventSummary {
  description: string;
  registrationUrl: string | null;
  organizerVerified: boolean;
  checkedInCount: number;
  waitlistCount: number;
  /** อักษรย่อชื่อผู้ลงทะเบียนล่าสุด (ไม่เกิน 3 คน) */
  participantInitials: string[];
  /** อยู่ในคิวลำดับที่เท่าไร (เฉพาะ WAITLISTED) */
  myWaitlistPosition: number | null;
  myReward: number;
  hidden: boolean;
  checkInOpen: boolean;
  checkInOpensAt: string;
  checkInClosesAt: string;
  /** เหตุผลที่ลงทะเบียนไม่ได้ (null = ลงได้) */
  registerBlockedReason: string | null;
  // เฉพาะผู้จัด
  postFee: number;
  escrowBalance: number | null;
  rewardSlots: number;
  rewardedCount: number;
  reviewNote: string | null;
}

export interface EventAttendee { name: string | null; faculty: string | null; status: RegistrationStatus; checkedInAt: string | null; registeredAt: string }
export interface CheckInCodeResponse { code: string; expiresInSec: number; checkInUrl: string }
export interface CheckInResponse { checkedInAt: string; reward: number; balance: number; note: string | null }

// ───────────────────────── ฟีดรวม + จับคู่ความสนใจ (ขั้นที่ 5) ─────────────────────────

export const FEED_TABS = ['all', 'foryou'] as const;
export type FeedTab = (typeof FEED_TABS)[number];

export type FeedItem =
  | { kind: 'survey'; id: string; score: number; reasons: string[]; survey: SurveySummary }
  | { kind: 'event'; id: string; score: number; reasons: string[]; event: EventSummary };

export interface FeedViewer { interests: string[]; faculty: string | null }

/**
 * คะแนนจับคู่ของโพสต์ในฟีด "ฟีดของคุณ" (docs/coin-rules.md ข้อ 1: รางวัลสูงช่วยดันฟีด แต่เป็นแค่ปัจจัยหนึ่ง)
 * - ตรงกับความสนใจ: 2 ต่อหัวข้อ (สูงสุด 3 หัวข้อ)
 * - แบบสอบถามจากคณะเดียวกัน: +1
 * - รางวัล: แบบสอบถาม 0–1.5 ตามสัดส่วนกับค่าแนะนำ / Event ที่ยังมีรางวัลเช็กอิน +0.5
 * - ใกล้ปิดรับ (48 ชม.) / Event เริ่มภายใน 3 วัน: +0.5
 * ความตรงกับความสนใจหนักกว่ารางวัลเสมอ คนที่ลง Coin เยอะจึงดันได้ไม่เกินโพสต์ที่ตรงความสนใจ 1 หัวข้อ
 */
export function scoreFeedItem(item: { kind: 'survey'; survey: SurveySummary } | { kind: 'event'; event: EventSummary }, viewer: FeedViewer, now = Date.now()) {
  const tags = item.kind === 'survey' ? item.survey.tags : item.event.tags;
  const matched = tags.filter((t) => viewer.interests.includes(t)).slice(0, 3);
  const reasons = matched.map((t) => bi(`You like ${INTEREST_EN[t as keyof typeof INTEREST_EN] ?? t}`, `สนใจ${t}`));
  let score = matched.length * 2;
  let relevant = matched.length > 0;
  if (item.kind === 'survey') {
    const s = item.survey;
    if (viewer.faculty && s.ownerFaculty === viewer.faculty) { score += 1; relevant = true; reasons.push(bi('Your faculty', 'คณะเดียวกับคุณ')); }
    const band = surveyBand(s.questionCount);
    if (band) score += Math.min(1.5, s.rewardPerResponse / band.suggestedReward);
    if (new Date(s.closesAt).getTime() - now < 48 * 3_600_000) { score += 0.5; reasons.push(bi('Closing soon', 'ใกล้ปิดรับ')); }
  } else {
    const e = item.event;
    if (e.rewardPerCheckIn > 0 && e.rewardsLeft > 0) score += 0.5;
    if (new Date(e.startsAt).getTime() - now < 3 * 86_400_000) { score += 0.5; reasons.push(bi('Coming up', 'เร็ว ๆ นี้')); }
  }
  return { score: Math.round(score * 100) / 100, relevant, reasons };
}

// ───────────────────────── กระเป๋า Coin ─────────────────────────

export type TxType = 'SIGNUP_BONUS' | 'ADMIN_ADJUST' | 'POST_FEE' | 'ESCROW_FUND' | 'SUBSIDY' | 'SURVEY_REWARD' | 'ESCROW_REFUND' | 'EVENT_REWARD'
  | 'REWARD_REDEEM' | 'REWARD_REFUND';
export const TX_LABEL: Record<TxType, string> = {
  SIGNUP_BONUS: bi('Sign-up bonus', 'โบนัสสมัครสมาชิก'), ADMIN_ADJUST: bi('Admin adjustment', 'ปรับยอดโดยแอดมิน'),
  POST_FEE: bi('Posting fee', 'ค่าโพสต์'), ESCROW_FUND: bi('Reward funding', 'ลง Coin รางวัล'), SUBSIDY: bi('Launch subsidy', 'ระบบสมทบ'),
  SURVEY_REWARD: bi('Survey reward', 'รางวัลตอบแบบสอบถาม'), ESCROW_REFUND: bi('Coin refund', 'คืน Coin'),
  EVENT_REWARD: bi('Event check-in reward', 'รางวัลเช็กอิน กิจกรรม'), REWARD_REDEEM: bi('Reward redemption', 'แลกของรางวัล'),
  REWARD_REFUND: bi('Redemption refund', 'คืน Coin จากการแลกของรางวัล'),
};
export interface WalletEntry { id: string; delta: number; type: TxType; memo: string | null; createdAt: string }
export interface WalletResponse { balance: number; earned: number; spent: number; entries: WalletEntry[]; nextBefore: string | null }

// ───────────────────────── แจ้งเตือน + บันทึก (ขั้นที่ 5.2) ─────────────────────────

export type NotificationType = 'EVENT_APPROVED' | 'EVENT_REJECTED' | 'EVENT_CANCELLED' | 'WAITLIST_PROMOTED'
  | 'SUBSIDY_APPROVED' | 'SUBSIDY_REJECTED' | 'SURVEY_SPONSORED' | 'SURVEY_CLOSED'
  | 'REWARD_FULFILLED' | 'REWARD_CANCELLED' | 'SURVEY_REWARDED' | 'SURVEY_PRIZE_WON' | 'SURVEY_CONNECTED';
export interface NotificationItem { id: string; type: NotificationType; title: string; body: string; link: string | null; read: boolean; createdAt: string }
export interface NotificationList { items: NotificationItem[]; unread: number; nextBefore: string | null }

// ───────────────────────── ร้านรางวัล (ขั้นที่ 6) ─────────────────────────
// Coin ได้จากกิจกรรมในแอปเท่านั้น แลกเป็นของรางวัลได้ แต่เติมเงินซื้อ Coin หรือแลกกลับเป็นเงินไม่ได้

export const REWARD_RULES = {
  /** ต้องยืนยันอีเมล @cmu.ac.th ก่อนแลก (กันบัญชีปลอมมาฟาร์ม Coin) */
  REQUIRE_CMU: true,
  MAX_COST: 100_000,
  MAX_STOCK: 10_000,
  MAX_PER_USER: 100,
} as const;


const rewardFields = {
  title: z.string().trim().min(2, bi('Name needs at least 2 characters', 'ชื่ออย่างน้อย 2 ตัวอักษร')).max(80),
  description: z.string().trim().min(1, bi('Add details and how to collect it', 'กรุณาใส่รายละเอียดและวิธีรับของ')).max(1000),
  imageUrl: optionalUrl,
  cost: z.coerce.number().int().min(1, bi('Price must be at least 1 Coin', 'ราคาอย่างน้อย 1 Coin')).max(REWARD_RULES.MAX_COST),
  stock: z.coerce.number().int().min(0, bi('Stock cannot be negative', 'จำนวนต้องไม่ติดลบ')).max(REWARD_RULES.MAX_STOCK),
  perUserLimit: z.coerce.number().int().min(1).max(REWARD_RULES.MAX_PER_USER),
  active: z.boolean(),
};
export const rewardSchema = z.object({
  ...rewardFields, perUserLimit: rewardFields.perUserLimit.default(1), active: rewardFields.active.default(true),
});
export type RewardInput = z.input<typeof rewardSchema>;
/** แก้ไข: ส่งเฉพาะช่องที่เปลี่ยน (ไม่มีค่า default เพื่อไม่ให้ทับค่าเดิม) */
export const updateRewardSchema = z.object(rewardFields).partial();
export type UpdateRewardInput = z.input<typeof updateRewardSchema>;

export const decideRedemptionSchema = z.object({
  action: z.enum(['FULFILL', 'CANCEL']),
  note: z.string().trim().max(300).optional(),
}).refine((v) => v.action === 'FULFILL' || !!v.note, { message: bi('Please give a reason for cancelling', 'กรุณาใส่เหตุผลที่ยกเลิก'), path: ['note'] });
export type DecideRedemptionInput = z.infer<typeof decideRedemptionSchema>;

export type RedemptionStatus = 'PENDING' | 'FULFILLED' | 'CANCELLED';
export const REDEMPTION_STATUS_LABEL: Record<RedemptionStatus, string> = { PENDING: bi('Waiting for pickup', 'รอรับของ'), FULFILLED: bi('Received', 'ได้รับแล้ว'), CANCELLED: bi('Cancelled', 'ยกเลิกแล้ว') };

export interface RewardItem {
  id: string; title: string; description: string; imageUrl: string | null; cost: number; stock: number;
  perUserLimit: number; active: boolean;
  /** จำนวนครั้งที่ผู้ใช้คนนี้แลกไปแล้ว (ไม่นับที่ยกเลิก) */
  redeemedByMe: number;
}
export interface RedemptionItem {
  id: string; status: RedemptionStatus; cost: number; note: string | null; createdAt: string; decidedAt: string | null;
  reward: { id: string; title: string; imageUrl: string | null };
}
export interface AdminRedemptionItem extends RedemptionItem {
  user: { displayName: string | null; email: string; cmuEmail: string | null; faculty: string | null };
}

// ───────────────────────── แอดมิน: เพิ่ม Coin ทดสอบ ─────────────────────────
export const grantCoinSchema = z.object({
  email: z.string().trim().toLowerCase().email(bi('Invalid email address', 'อีเมลไม่ถูกต้อง')),
  amount: z.coerce.number().int().min(1).max(100_000, bi('Up to 100,000 Coin at a time', 'เพิ่มได้ครั้งละไม่เกิน 100,000 Coin')),
  memo: z.string().trim().min(1, bi('Please give a reason', 'กรุณาใส่เหตุผล')).max(120),
});
export type GrantCoinInput = z.infer<typeof grantCoinSchema>;

/** Apps Script ส่งผลการส่งฟอร์มมา (ไม่ต้องล็อกอิน — ตรวจด้วย secret ของแบบสอบถาม) */
export const formHookSchema = z.object({
  secret: z.string().min(16).max(128),
  ping: z.boolean().optional(),
  /** ping: ลิงก์กรอกล่วงหน้าที่สคริปต์สร้าง (ช่องรหัสใส่คำว่า TEMBO) — บอกว่าช่องรหัสคือ entry ไหน */
  prefillUrl: z.string().max(2000).optional(),
  /** ข้อความทุกช่องที่เป็นรูปแบบรหัส TEMBO ในคำตอบที่ส่ง */
  codes: z.array(z.string().trim().toUpperCase()).max(20).default([]),
});
export type FormHookInput = z.infer<typeof formHookSchema>;

// ───────────────────────── ฉบับร่างแบบสอบถาม ─────────────────────────
export const DRAFT_RULES = { MAX_PER_USER: 20, MAX_BYTES: 20_000 } as const;
export const saveDraftSchema = z.object({
  title: z.string().trim().max(150).default(''),
  stepsDone: z.number().int().min(0).max(4),
  /** ข้อมูลฟอร์มทั้งหมด (โครงสร้างตามหน้าเว็บ) */
  data: z.record(z.unknown()),
});
export type SaveDraftInput = z.input<typeof saveDraftSchema>;
export interface DraftSummary { id: string; title: string; stepsDone: number; updatedAt: string }
export interface DraftDetail extends DraftSummary { data: Record<string, unknown> }
