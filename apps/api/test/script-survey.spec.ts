import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertLedgerInvariant, balanceOf, createTestApp, makeUser, resetDb } from './helpers';

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const PREFILL = 'https://docs.google.com/forms/d/e/1FAIpQLSf_test-Form/viewform?usp=pp_url&entry.1111=ไม่เกี่ยว&entry.2222=TEMBO';
const base = {
  title: 'การเรียนรู้ในมหาวิทยาลัย 2026', description: 'ช่วยตอบหน่อย', mode: 'EXTERNAL', externalVerify: 'SCRIPT', externalUrl: PREFILL,
  externalQuestionCount: 8, rewardPerResponse: 5, quota: 3, closesAt: inDays(7), ownerContribution: 15,
  category: 'EDUCATION', estMinutes: 5, tags: ['การศึกษา'],
};

describe('แบบสอบถาม Google Form + สคริปต์ส่งผลอัตโนมัติ', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const hook = (id: string, body: object) => request(app.getHttpServer()).post(`/hooks/forms/${id}`).send(body);

  beforeAll(async () => { ({ app, prisma } = await createTestApp()); });
  beforeEach(async () => resetDb(prisma));
  afterEach(async () => assertLedgerInvariant(prisma));
  afterAll(async () => app.close());

  /** สร้าง + จำลองการติดตั้งสคริปต์ (ping) */
  async function setup(extra: Record<string, unknown> = {}) {
    const owner = await makeUser(app);
    const s = (await owner.agent.post('/surveys').send({ ...base, ...extra }).expect(201)).body;
    return { owner, s, secret: s.script.secret as string };
  }

  it('ลิงก์ต้องเป็นลิงก์กรอกล่วงหน้าที่มีคำว่า TEMBO', async () => {
    const { agent } = await makeUser(app);
    await agent.post('/surveys').send({ ...base, externalUrl: 'https://forms.gle/abc' }).expect(400);
    await agent.post('/surveys').send({ ...base, externalUrl: PREFILL.replace('=TEMBO', '=xx') }).expect(400);
    const s = (await agent.post('/surveys').send(base).expect(201)).body;
    expect(s).toMatchObject({ externalVerify: 'SCRIPT', category: 'EDUCATION', estMinutes: 5, completionCode: null, externalUrl: 'https://docs.google.com/forms/d/e/1FAIpQLSf_test-Form/viewform' });
    expect(s.script).toMatchObject({ endpoint: expect.stringContaining(`/api/hooks/forms/${s.id}`), connectedAt: null });
  });

  it('ยังไม่เชื่อมสคริปต์ → ไม่ขึ้นรายการและตอบไม่ได้; ping แล้วเปิดให้ตอบ + แจ้งผู้โพสต์', async () => {
    const { owner, s, secret } = await setup();
    const u = await makeUser(app);
    expect((await u.agent.get('/surveys').expect(200)).body).toHaveLength(0);
    expect((await u.agent.get(`/surveys/${s.id}`).expect(200)).body.respondBlockedReason).toMatch(/ยังเชื่อม Google Form/);
    await hook(s.id, { secret: 'x'.repeat(32), ping: true }).expect(403);
    await hook(s.id, { secret, ping: true }).expect(200);
    expect((await u.agent.get('/surveys').expect(200)).body).toHaveLength(1);
    expect((await owner.agent.get('/notifications').expect(200)).body.items[0].type).toBe('SURVEY_CONNECTED');
    expect((await u.agent.get(`/surveys/${s.id}`).expect(200)).body.script).toBeNull(); // secret เห็นเฉพาะผู้โพสต์
  });

  it('รางวัลเท่ากัน: เริ่ม → ได้รหัสในลิงก์ → ฟอร์มส่งผล → ได้ Coin ทันที (ส่งซ้ำไม่จ่ายซ้ำ)', async () => {
    const { s, secret } = await setup();
    await hook(s.id, { secret, ping: true }).expect(200);
    const u = await makeUser(app, { balance: 0 });
    const st = (await u.agent.post(`/surveys/${s.id}/start`).expect(200)).body;
    expect(st.code).toMatch(/^TB[A-Z0-9]{8}$/);
    expect(st.url).toBe(`https://docs.google.com/forms/d/e/1FAIpQLSf_test-Form/viewform?usp=pp_url&entry.2222=${st.code}`);
    // เริ่มซ้ำได้รหัสเดิม
    expect((await u.agent.post(`/surveys/${s.id}/start`).expect(200)).body.code).toBe(st.code);
    await u.agent.post(`/surveys/${s.id}/verify`).send({ code: 'ABCDEF' }).expect(400);

    expect((await hook(s.id, { secret, codes: ['TBNOTREAL1'] }).expect(200)).body.ok).toBe(false);
    expect((await hook(s.id, { secret, codes: ['คำตอบอื่น', st.code.toLowerCase()] }).expect(200)).body).toEqual({ ok: true });
    expect(await balanceOf(prisma, u.wallet.id)).toBe(5);
    expect((await hook(s.id, { secret, codes: [st.code] }).expect(200)).body).toMatchObject({ ok: true, duplicate: true });
    expect(await balanceOf(prisma, u.wallet.id)).toBe(5);
    const d = (await u.agent.get(`/surveys/${s.id}`).expect(200)).body;
    expect(d).toMatchObject({ responded: true, myStart: { submittedAt: expect.any(String) } });
    expect((await u.agent.get('/notifications').expect(200)).body.items[0]).toMatchObject({ type: 'SURVEY_REWARDED', title: 'ได้รับ 5 Coin' });
  });

  it('Eligibility: จำกัดคณะ/ชั้นปี → คนนอกกลุ่มตอบไม่ได้และไม่เห็นในฟีด', async () => {
    const { s, secret } = await setup({ eligibleFaculties: ['วิศวกรรมศาสตร์'], eligibleYears: [3, 4] });
    await hook(s.id, { secret, ping: true }).expect(200);
    const outsider = await makeUser(app);
    await prisma.user.update({ where: { id: outsider.user.id }, data: { faculty: 'นิติศาสตร์', studyYear: 3 } });
    const insider = await makeUser(app);
    await prisma.user.update({ where: { id: insider.user.id }, data: { faculty: 'วิศวกรรมศาสตร์', studyYear: 4 } });
    await outsider.agent.post(`/surveys/${s.id}/start`).expect(400);
    expect((await outsider.agent.get('/feed').expect(200)).body.some((i: { id: string }) => i.id === s.id)).toBe(false);
    await insider.agent.post(`/surveys/${s.id}/start`).expect(200);
    expect((await insider.agent.get('/feed').expect(200)).body.some((i: { id: string }) => i.id === s.id)).toBe(true);
  });

  it('สุ่มจับรางวัล: ส่งแล้วได้สิทธิ์ลุ้น → ปิดแล้วสุ่มผู้ได้รางวัล จ่ายตามอันดับ คืนส่วนที่เหลือ', async () => {
    const draw = { rewardMode: 'DRAW', prizes: [20, 50, 30], rewardPerResponse: 50, quota: 10, ownerContribution: 100 };
    const owner = await makeUser(app, { balance: 200 });
    // ต้องลงครบยอดรางวัล
    await owner.agent.post('/surveys').send({ ...base, ...draw, ownerContribution: 99 }).expect(400);
    await owner.agent.post('/surveys').send({ ...base, ...draw, prizes: [50, 1] }).expect(400); // ต่ำกว่าขั้นต่ำ
    const s = (await owner.agent.post('/surveys').send({ ...base, ...draw }).expect(201)).body;
    expect(s).toMatchObject({ rewardMode: 'DRAW', prizes: [50, 30, 20], targetPool: 100, payableResponses: 10 });
    await hook(s.id, { secret: s.script.secret, ping: true }).expect(200);

    // ผู้ตอบ 2 คน < 3 รางวัล → ได้รางวัลทั้งคู่ รางวัลที่เหลือคืนผู้โพสต์
    const [a, b] = await Promise.all([makeUser(app, { balance: 0 }), makeUser(app, { balance: 0 })]);
    for (const u of [a, b]) {
      const st = (await u.agent.post(`/surveys/${s.id}/start`).expect(200)).body;
      await hook(s.id, { secret: s.script.secret, codes: [st.code] }).expect(200);
      expect(await balanceOf(prisma, u.wallet.id)).toBe(0); // ยังไม่ได้จนกว่าจะสุ่ม
    }
    const ownerBefore = await balanceOf(prisma, owner.wallet.id);
    await owner.agent.post(`/surveys/${s.id}/close`).expect(200);
    const got = [await balanceOf(prisma, a.wallet.id), await balanceOf(prisma, b.wallet.id)].sort((x, y) => y - x);
    expect(got).toEqual([50, 30]);
    expect(await balanceOf(prisma, owner.wallet.id)).toBe(ownerBefore + 20);
    const d = (await a.agent.get(`/surveys/${s.id}`).expect(200)).body;
    expect(d.drawnAt).toBeTruthy();
    expect(d.winners.map((w: { rank: number; prize: number }) => [w.rank, w.prize])).toEqual([[1, 50], [2, 30]]);
    expect([1, 2]).toContain(d.myPrizeRank);
    expect((await a.agent.get('/notifications').expect(200)).body.items[0].type).toBe('SURVEY_PRIZE_WON');
  });

  it('สุ่มจับรางวัล: ครบจำนวนผู้ตอบ → ปิดและสุ่มทันที, ผู้ได้รางวัลไม่ซ้ำกัน', async () => {
    const owner = await makeUser(app, { balance: 200 });
    const s = (await owner.agent.post('/surveys').send({ ...base, rewardMode: 'DRAW', prizes: [10, 5], rewardPerResponse: 10, quota: 3, ownerContribution: 15 }).expect(201)).body;
    await hook(s.id, { secret: s.script.secret, ping: true }).expect(200);
    const users = await Promise.all([1, 2, 3].map(() => makeUser(app, { balance: 0 })));
    for (const u of users) {
      const st = (await u.agent.post(`/surveys/${s.id}/start`).expect(200)).body;
      await hook(s.id, { secret: s.script.secret, codes: [st.code] }).expect(200);
    }
    const d = (await owner.agent.get(`/surveys/${s.id}`).expect(200)).body;
    expect(d.status).toBe('CLOSED');
    const balances = (await Promise.all(users.map((u) => balanceOf(prisma, u.wallet.id)))).sort((x, y) => y - x);
    expect(balances).toEqual([10, 5, 0]);
  });
});
