import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

// โหลด .env ที่รากของ monorepo ก่อนเทสต์ทุกไฟล์ (ถ้ามี) — ค่าที่ตั้งไว้ใน env ของระบบมาก่อน
try {
  const vars = parseEnv(readFileSync(join(__dirname, '../../../.env'), 'utf8'));
  for (const [k, v] of Object.entries(vars)) process.env[k] ??= v;
} catch { /* ไม่มี .env */ }
process.env.JWT_SECRET ??= 'test-jwt-secret';
process.env.OTP_SECRET ??= 'test-otp-secret';
