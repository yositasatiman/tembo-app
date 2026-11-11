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
