import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { ageOtps, createTestApp, FakeMail, login, resetDb } from './helpers';

describe('Auth & profile', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: FakeMail;

  beforeAll(async () => ({ app, prisma, mail } = await createTestApp()));
  beforeEach(async () => { await resetDb(prisma); mail.sent = []; });
  afterAll(async () => app.close());

  it('สมัครด้วยอีเมล + OTP แล้วได้ 100 Coin และโค้ดชวนเพื่อน', async () => {
    const { agent, res } = await login(app, prisma, mail, 'New.User@Gmail.com');
    expect(res.body.isNew).toBe(true);
    expect(res.body.me.email).toBe('new.user@gmail.com');
    expect(res.body.me.balance).toBe(100);
    expect(res.body.me.referralCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';')).toMatch(/tembo_at=.*HttpOnly/);
    const me = await agent.get('/me').expect(200);
    expect(me.body.onboarded).toBe(false);
  });

  it('ล็อกอินซ้ำไม่ได้โบนัสซ้ำ', async () => {
    await login(app, prisma, mail, 'a@gmail.com');
    const { res } = await login(app, prisma, mail, 'a@gmail.com');
    expect(res.body.isNew).toBe(false);
    expect(res.body.me.balance).toBe(100);
    expect(await prisma.ledgerTx.count({ where: { type: 'SIGNUP_BONUS' } })).toBe(1);
  });

  it('ขอรหัสซ้ำภายใน 60 วินาทีไม่ได้', async () => {
    const s = request(app.getHttpServer());
    await s.post('/auth/otp/request').send({ email: 'a@gmail.com' }).expect(200);
    await s.post('/auth/otp/request').send({ email: 'a@gmail.com' }).expect(429);
  });

  it('ใส่รหัสผิด 5 ครั้งแล้วรหัสถูกก็ใช้ไม่ได้ และรหัสใช้ซ้ำไม่ได้', async () => {
    const s = request(app.getHttpServer());
    await s.post('/auth/otp/request').send({ email: 'a@gmail.com' }).expect(200);
    const code = mail.lastCode('a@gmail.com')!;
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) await s.post('/auth/otp/verify').send({ email: 'a@gmail.com', code: wrong }).expect(400);
    const locked = await s.post('/auth/otp/verify').send({ email: 'a@gmail.com', code }).expect(400);
    expect(locked.body.message).toMatch(/เกินกำหนด/);

    await ageOtps(prisma);
    await s.post('/auth/otp/request').send({ email: 'b@gmail.com' }).expect(200);
    const codeB = mail.lastCode('b@gmail.com')!;
    await s.post('/auth/otp/verify').send({ email: 'b@gmail.com', code: codeB }).expect(200);
    await s.post('/auth/otp/verify').send({ email: 'b@gmail.com', code: codeB }).expect(400);
  });

  it('เรียก /me โดยไม่ล็อกอินได้ 401', async () => {
    await request(app.getHttpServer()).get('/me').expect(401);
  });

  it('อัปเดตโปรไฟล์: ตรวจข้อมูลแล้ว onboarded = true', async () => {
    const { agent } = await login(app, prisma, mail, 'a@gmail.com');
    await agent.patch('/me/profile').send({ displayName: 'Yo', faculty: 'ไม่มีคณะนี้', studyYear: 4, interests: ['เทคโนโลยี'] }).expect(400);
    const ok = await agent.patch('/me/profile')
      .send({ displayName: 'Yo', faculty: 'วิศวกรรมศาสตร์', studyYear: 4, interests: ['เทคโนโลยี', 'ดนตรี'] }).expect(200);
    expect(ok.body.onboarded).toBe(true);
  });

  it('ยืนยันอีเมล @cmu.ac.th ได้ 1 อีเมลต่อ 1 บัญชี', async () => {
    const { agent } = await login(app, prisma, mail, 'a@gmail.com');
    await agent.post('/me/cmu-email/request').send({ cmuEmail: 'a@gmail.com' }).expect(400);
    await agent.post('/me/cmu-email/request').send({ cmuEmail: 'Student_A@cmu.ac.th' }).expect(200);
    const code = mail.lastCode('student_a@cmu.ac.th')!;
    const v = await agent.post('/me/cmu-email/verify').send({ code }).expect(200);
    expect(v.body.cmuVerified).toBe(true);
    expect(v.body.cmuEmail).toBe('student_a@cmu.ac.th');

    const { agent: other } = await login(app, prisma, mail, 'b@gmail.com');
    await other.post('/me/cmu-email/request').send({ cmuEmail: 'student_a@cmu.ac.th' }).expect(409);
  });

  it('โค้ดชวนเพื่อนบันทึกผู้ชวน', async () => {
    const { res: a } = await login(app, prisma, mail, 'a@gmail.com');
    await login(app, prisma, mail, 'b@gmail.com', a.body.me.referralCode);
    const b = await prisma.user.findUniqueOrThrow({ where: { email: 'b@gmail.com' } });
    expect(b.referredById).toBe(a.body.me.id);
  });

  it('refresh token หมุนได้ และใช้ token เก่าซ้ำ = ยกเลิกทุกเซสชัน', async () => {
    const { agent, res } = await login(app, prisma, mail, 'a@gmail.com');
    const oldRt = ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c: string) => c.startsWith('tembo_rt='))!.split(';')[0];
    await agent.post('/auth/refresh').expect(200);
    // ภายใน 30 วินาที (หลายแท็บ refresh พร้อมกัน): ปฏิเสธ แต่ไม่ตัดเซสชันอื่น
    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', oldRt).expect(401);
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(1);
    // เกิน 30 วินาที = ถือว่าถูกขโมย ตัดทุกเซสชัน
    await prisma.session.updateMany({ where: { revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } });
    await request(app.getHttpServer()).post('/auth/refresh').set('Cookie', oldRt).expect(401);
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('อีเมลใน ADMIN_EMAILS ได้สิทธิ์แอดมินเมื่อล็อกอิน', async () => {
    process.env.ADMIN_EMAILS = 'Boss@Test.dev, other@test.dev';
    try {
      const { agent } = await login(app, prisma, mail, 'boss@test.dev');
      expect((await agent.get('/me').expect(200)).body.role).toBe('ADMIN');
      const { agent: normal } = await login(app, prisma, mail, 'normal@test.dev');
      expect((await normal.get('/me').expect(200)).body.role).toBe('MEMBER');
    } finally { delete process.env.ADMIN_EMAILS; }
  });
});
