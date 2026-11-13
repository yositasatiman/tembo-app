import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertLedgerInvariant, balanceOf, createTestApp, makeUser, resetDb } from './helpers';

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const base = {
  title: 'พฤติกรรมการเรียนออนไลน์', mode: 'EXTERNAL', externalUrl: 'https://forms.gle/abc123',
  externalQuestionCount: 12, rewardPerResponse: 4, quota: 3, closesAt: inDays(7), ownerContribution: 12,
};

describe('แบบสอบถามลิงก์ภายนอก + รหัสยืนยัน', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => { ({ app, prisma } = await createTestApp()); });
  beforeEach(async () => resetDb(prisma));
  afterEach(async () => assertLedgerInvariant(prisma));
  afterAll(async () => app.close());

  /** ย้อนเวลาเริ่มให้พ้นช่วงรอ 30 วินาที */
  const age = (surveyId: string) => prisma.surveyStart.updateMany({ where: { surveyId }, data: { startedAt: new Date(Date.now() - 60_000) } });

  it('ตรวจข้อมูล: ต้องมีลิงก์ https และจำนวนข้อ, รางวัลขั้นต่ำคิดจากจำนวนข้อที่ระบุ', async () => {
    const { agent } = await makeUser(app);
    await agent.post('/surveys').send({ ...base, externalUrl: undefined }).expect(400);
    await agent.post('/surveys').send({ ...base, externalUrl: 'http://forms.gle/x' }).expect(400);
    await agent.post('/surveys').send({ ...base, externalQuestionCount: undefined }).expect(400);
    const r = await agent.post('/surveys').send({ ...base, externalQuestionCount: 25 }).expect(400);
    expect(r.body.message).toMatch(/อย่างน้อย 6 Coin/);
    await agent.post('/surveys').send({ ...base, questions: [{ type: 'SHORT_TEXT', title: 'x', required: true, options: [] }] }).expect(400);
  });

  it('ผู้โพสต์เห็นลิงก์และรหัสยืนยัน คนอื่นเห็นลิงก์หลังกดเริ่มเท่านั้น และไม่เห็นรหัส', async () => {
    const owner = await makeUser(app);
    const u = await makeUser(app);
    const s = (await owner.agent.post('/surveys').send(base).expect(201)).body;
    expect(s).toMatchObject({ mode: 'EXTERNAL', questionCount: 12, externalUrl: base.externalUrl });
    expect(s.completionCode).toMatch(/^[A-Z2-9]{6}$/);

    const before = (await u.agent.get(`/surveys/${s.id}`).expect(200)).body;
    expect(before).toMatchObject({ externalUrl: null, completionCode: null, myStart: null, canRespond: true });
    await u.agent.get(`/surveys/${s.id}/form`).expect(400);
    await u.agent.post(`/surveys/${s.id}/responses`).send({ answers: {} }).expect(400);

    const start = (await u.agent.post(`/surveys/${s.id}/start`).expect(200)).body;
    expect(start).toMatchObject({ url: base.externalUrl, attemptsLeft: 5 });
    expect(start.refCode).toMatch(/^[A-Z2-9]{6}$/);
    // กดเริ่มซ้ำ เวลาเริ่มไม่เปลี่ยน
    expect((await u.agent.post(`/surveys/${s.id}/start`).expect(200)).body.startedAt).toBe(start.startedAt);
    const after = (await u.agent.get(`/surveys/${s.id}`).expect(200)).body;
    expect(after).toMatchObject({ externalUrl: base.externalUrl, completionCode: null });
    expect(after.myStart.refCode).toBe(start.refCode);
    await owner.agent.post(`/surveys/${s.id}/start`).expect(400);
  });

  it('กรอกรหัส: ต้องกดเริ่มก่อน, ต้องรอ 30 วินาที, รหัสถูกได้ Coin, ตอบซ้ำไม่ได้', async () => {
    const owner = await makeUser(app);
    const u = await makeUser(app, { balance: 0 });
    const s = (await owner.agent.post('/surveys').send(base).expect(201)).body;
    await u.agent.post(`/surveys/${s.id}/verify`).send({ code: s.completionCode }).expect(400);
    await u.agent.post(`/surveys/${s.id}/start`).expect(200);
    const early = await u.agent.post(`/surveys/${s.id}/verify`).send({ code: s.completionCode }).expect(400);
    expect(early.body.message).toMatch(/รออีก/);
    await age(s.id);
    const ok = (await u.agent.post(`/surveys/${s.id}/verify`).send({ code: s.completionCode.toLowerCase() }).expect(200)).body;
    expect(ok).toEqual({ reward: 4, balance: 4 });
    await u.agent.post(`/surveys/${s.id}/verify`).send({ code: s.completionCode }).expect(409);

    const csv = await owner.agent.get(`/surveys/${s.id}/results.csv`).expect(200);
    expect(csv.text).toContain('รหัสอ้างอิง');
    const refCode = (await u.agent.get(`/surveys/${s.id}`).expect(200)).body.myStart.refCode;
    expect(csv.text).toContain(refCode);
  });

  it('รหัสผิดเกิน 5 ครั้ง → ล็อก แม้ภายหลังใส่รหัสถูก', async () => {
    const owner = await makeUser(app);
    const u = await makeUser(app, { balance: 0 });
    const s = (await owner.agent.post('/surveys').send(base).expect(201)).body;
    await u.agent.post(`/surveys/${s.id}/start`).expect(200);
    await age(s.id);
    const wrong = s.completionCode === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA';
    for (let i = 4; i >= 0; i--) {
      const r = await u.agent.post(`/surveys/${s.id}/verify`).send({ code: wrong }).expect(400);
      expect(r.body.message).toMatch(i > 0 ? new RegExp(`เหลืออีก ${i} ครั้ง`) : /ครบจำนวนครั้ง/);
    }
    await u.agent.post(`/surveys/${s.id}/verify`).send({ code: s.completionCode }).expect(403);
    expect(await balanceOf(prisma, u.wallet.id)).toBe(0);
    expect((await u.agent.get(`/surveys/${s.id}`).expect(200)).body.myStart.attemptsLeft).toBe(0);
  });

  it('ครบโควตาแล้วปิดรับอัตโนมัติ และคืน Coin ที่เหลือ', async () => {
    const owner = await makeUser(app, { balance: 100 });
    const s = (await owner.agent.post('/surveys').send({ ...base, quota: 2, ownerContribution: 8 }).expect(201)).body;
    for (let i = 0; i < 2; i++) {
      const u = await makeUser(app, { balance: 0 });
      await u.agent.post(`/surveys/${s.id}/start`).expect(200);
      await age(s.id);
      await u.agent.post(`/surveys/${s.id}/verify`).send({ code: s.completionCode }).expect(200);
    }
    expect((await owner.agent.get(`/surveys/${s.id}`).expect(200)).body).toMatchObject({ status: 'CLOSED', responsesCount: 2 });
    const late = await makeUser(app);
    await late.agent.post(`/surveys/${s.id}/start`).expect(400);
  });
});
