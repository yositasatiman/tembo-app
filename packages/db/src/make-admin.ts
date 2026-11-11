import path from 'node:path';
import { createPrismaClient } from './client';

// ใช้: pnpm db:make-admin you@example.com
try { process.loadEnvFile(path.join(__dirname, '../../../.env')); } catch { /* ใช้ env ของระบบ */ }
const email = process.argv[2]?.trim().toLowerCase();
if (!email) { console.error('ใช้: pnpm db:make-admin <อีเมลที่ใช้ล็อกอิน>'); process.exit(1); }

const prisma = createPrismaClient();
prisma.user.update({ where: { email }, data: { role: 'ADMIN' } })
  .then((u) => console.log(`ตั้ง ${u.email} เป็นแอดมินแล้ว — ออกจากระบบแล้วล็อกอินใหม่เพื่อให้มีผล`))
  .catch(() => { console.error(`ไม่พบผู้ใช้ ${email} (ต้องล็อกอินเว็บอย่างน้อย 1 ครั้งก่อน)`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
