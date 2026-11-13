function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const config = {
  /** Render/Railway ตั้ง PORT ให้เอง */
  get port() { return Number(process.env.PORT ?? process.env.API_PORT ?? 4000); },
  get webOrigin() { return process.env.WEB_ORIGIN ?? 'http://localhost:3000'; },
  get jwtSecret() { return required('JWT_SECRET'); },
  get otpSecret() { return required('OTP_SECRET'); },
  get resendApiKey() { return process.env.RESEND_API_KEY || ''; },
  /** ส่งอีเมลผ่าน SMTP (เช่น Gmail + App Password) — ใช้เมื่อไม่มี RESEND_API_KEY */
  get smtp() {
    const host = process.env.SMTP_HOST;
    if (!host) return null;
    return { host, port: Number(process.env.SMTP_PORT ?? 465), user: process.env.SMTP_USER ?? '', pass: process.env.SMTP_PASS ?? '' };
  },
  /** อีเมลที่ได้สิทธิ์แอดมินอัตโนมัติเมื่อล็อกอิน (คั่นด้วย ,) */
  get adminEmails() { return (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean); },
  /** อยู่หลัง proxy (Render/Vercel) → ใช้ IP จาก X-Forwarded-For */
  get trustProxy() { return process.env.TRUST_PROXY === 'true'; },
  get mailFrom() { return process.env.MAIL_FROM ?? 'TEMBO <onboarding@resend.dev>'; },
  get cookieSecure() { return process.env.COOKIE_SECURE === 'true'; },
  accessTokenTtlSec: 15 * 60,
  refreshTokenTtlDays: 30,
  otp: {
    ttlMin: 10,
    maxAttempts: 5,
    resendCooldownSec: 60,
    maxPerHour: 5,
  },
};
