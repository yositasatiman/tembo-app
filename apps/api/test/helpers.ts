import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SYSTEM_WALLETS } from '@tembo/db';
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
    'TRUNCATE "LedgerEntry","LedgerTx","Session","EmailOtp","Wallet","User" RESTART IDENTITY CASCADE',
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
