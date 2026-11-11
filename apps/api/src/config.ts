function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export const config = {
  get port() { return Number(process.env.API_PORT ?? 4000); },
  get webOrigin() { return process.env.WEB_ORIGIN ?? 'http://localhost:3000'; },
  get jwtSecret() { return required('JWT_SECRET'); },
  get otpSecret() { return required('OTP_SECRET'); },
  get resendApiKey() { return process.env.RESEND_API_KEY || ''; },
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
