import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { SYSTEM_WALLETS } from '@tembo/db';
import { ACCESS_COOKIE } from '../src/common/auth';
import { LedgerService } from '../src/ledger/ledger.service';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/main';
import { MailService, OutgoingMail } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';


export class FakeMail extends MailService {
  sent: OutgoingMail[] = [];
  async send(mail: OutgoingMail) { this.sent.push(mail); }
  lastCode(to: string) {
    const m = [...this.sent].reverse().find((x) => x.to === to.trim().toLowerCase());
    return m?.text.match(/\d{6}/)?.[0];
  }
}

export async function createTestApp() {
  const mail = new FakeMail();
  const mod = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService).useValue(mail)
    .compile();
  const app = mod.createNestApplication();
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, mail };
}

export async function resetDb(prisma: PrismaService) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "SurveyStart","EventHide","EventRegistration","Event","SurveyResponse","SurveyContribution","Survey","LedgerEntry","LedgerTx","Session","EmailOtp","Wallet","User" RESTART IDENTITY CASCADE',
  );
  await prisma.wallet.create({ data: { id: SYSTEM_WALLETS.MINT, kind: 'SYSTEM_MINT' } });
  await prisma.wallet.create({ data: { id: SYSTEM_WALLETS.BURN, kind: 'SYSTEM_BURN' } });
}

/** ย้อนเวลาของ OTP เดิมเพื่อข้าม cooldown 60 วินาทีในเทสต์ */
export async function ageOtps(prisma: PrismaService) {
  await prisma.emailOtp.updateMany({ data: { createdAt: new Date(Date.now() - 120_000) } });
}

/** สมัคร/ล็อกอินครบ flow แล้วคืน agent ที่ถือ cookie */
export async function login(app: INestApplication, prisma: PrismaService, mail: FakeMail, email: string, referralCode?: string) {
  await ageOtps(prisma);
  const agent = request.agent(app.getHttpServer());
  await agent.post('/auth/otp/request').send({ email }).expect(200);
  const code = mail.lastCode(email)!;
  const res = await agent.post('/auth/otp/verify').send({ email, code, referralCode }).expect(200);
  return { agent, res };
}

let seq = 0;
/** สร้างผู้ใช้ตรงในฐานข้อมูล (เร็วกว่า login) พร้อม Coin ตั้งต้น และ agent ที่ถือ access cookie */
export async function makeUser(app: INestApplication, opts: { cmu?: boolean; balance?: number; role?: 'MEMBER' | 'ADMIN'; name?: string } = {}) {
  const prisma = app.get(PrismaService);
  const n = ++seq;
  const user = await prisma.user.create({
    data: {
      email: `u${n}-${Date.now()}@test.dev`,
      referralCode: `T${String(n).padStart(5, '0')}`.slice(-6),
      displayName: opts.name ?? `User ${n}`,
      role: opts.role ?? 'MEMBER',
      ...(opts.cmu === false ? {} : { cmuEmail: `u${n}-${Date.now()}@cmu.ac.th`, cmuVerifiedAt: new Date() }),
    },
  });
  const wallet = await prisma.wallet.create({ data: { kind: 'USER', userId: user.id } });
  const balance = opts.balance ?? 100;
  if (balance > 0) {
    await prisma.$transaction((tx) => app.get(LedgerService).post(tx, {
      type: 'ADMIN_ADJUST', idempotencyKey: `seed:${user.id}`,
      entries: [{ walletId: SYSTEM_WALLETS.MINT, delta: -balance }, { walletId: wallet.id, delta: balance }],
    }));
  }
  const token = await app.get(JwtService).signAsync({ sub: user.id, role: user.role }, { expiresIn: 3600 });
  const agent = request.agent(app.getHttpServer()).set('Cookie', `${ACCESS_COOKIE}=${token}`);
  return { user, wallet, agent };
}

export async function balanceOf(prisma: PrismaService, walletId: string) {
  return (await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } })).balance;
}

/** ผลรวม Coin ทั้งระบบต้องเป็น 0 และยอดทุกกระเป๋าต้องตรงกับผลรวม entry */
export async function assertLedgerInvariant(prisma: PrismaService) {
  const total = await prisma.wallet.aggregate({ _sum: { balance: true } });
  if (total._sum.balance !== 0) throw new Error(`system total = ${total._sum.balance}`);
  const bad = await prisma.$queryRaw<{ id: string }[]>`
    SELECT w.id FROM "Wallet" w LEFT JOIN "LedgerEntry" e ON e."walletId" = w.id
    GROUP BY w.id, w.balance HAVING w.balance <> COALESCE(SUM(e.delta), 0)`;
  if (bad.length) throw new Error(`wallet mismatch: ${bad.map((b) => b.id).join(',')}`);
  const neg = await prisma.wallet.count({ where: { balance: { lt: 0 }, kind: { not: 'SYSTEM_MINT' } } });
  if (neg) throw new Error('negative balance');
}
