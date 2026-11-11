import { INestApplication } from '@nestjs/common';
import { SYSTEM_WALLETS } from '@tembo/db';
import { PrismaService } from '../src/prisma/prisma.service';
import { proRata } from '../src/surveys/pro-rata';
import { SurveysService } from '../src/surveys/surveys.service';
import { assertLedgerInvariant, balanceOf, createTestApp, makeUser, resetDb } from './helpers';

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const base = { title: 'ความเครียดของนักศึกษา', questionCount: 8, rewardPerResponse: 2, quota: 100, closesAt: inDays(7) };

describe('Surveys: escrow / ค่าโพสต์ / ระบบสมทบ / เพื่อนสนับสนุน', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let surveys: SurveysService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    surveys = app.get(SurveysService);
  });
  beforeEach(async () => resetDb(prisma));
  afterEach(async () => assertLedgerInvariant(prisma));
  afterAll(async () => app.close());

  it('proRata แบ่งพอดีและเศษไปคนที่มีเศษมากก่อน', () => {
    expect(proRata(200, [100, 100, 100, 100, 100])).toEqual([40, 40, 40, 40, 40]);
    expect(proRata(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(proRata(7, [5, 0, 2])).toEqual([5, 0, 2]);
    expect(proRata(0, [5, 5])).toEqual([0, 0]);
  });

  it('ตรวจรางวัลขั้นต่ำตามจำนวนข้อ และจำนวนข้อสูงสุด 50', async () => {
    const { agent } = await makeUser(app);
    const r1 = await agent.post('/surveys').send({ ...base, questionCount: 25, rewardPerResponse: 5, ownerContribution: 50 }).expect(400);
    expect(r1.body.message).toMatch(/อย่างน้อย 6 Coin/);
    await agent.post('/surveys').send({ ...base, questionCount: 51, rewardPerResponse: 20, ownerContribution: 50 }).expect(400);
    await agent.post('/surveys').send({ ...base, closesAt: inDays(61), ownerContribution: 50 }).expect(400);
  });

  it('โพสต์แรกฟรี โพสต์ที่สองเสียค่าโพสต์ และ Coin ถูกล็อกใน Escrow', async () => {
    const { agent, wallet } = await makeUser(app, { balance: 200 });
    expect((await agent.get('/surveys/quote').expect(200)).body.isFirstPost).toBe(true);

    const s1 = (await agent.post('/surveys').send({ ...base, ownerContribution: 100 }).expect(201)).body;
    expect(s1).toMatchObject({ status: 'OPEN', postFee: 0, targetPool: 200, escrowBalance: 100, remainingToFund: 100, payableResponses: 50 });
    expect(await balanceOf(prisma, wallet.id)).toBe(100);

    expect((await agent.get('/surveys/quote').expect(200)).body.isFirstPost).toBe(false);
    const s2 = (await agent.post('/surveys').send({ ...base, questionCount: 15, rewardPerResponse: 4, quota: 10, ownerContribution: 40 }).expect(201)).body;
    expect(s2.postFee).toBe(20);
    expect(await balanceOf(prisma, wallet.id)).toBe(40);
    expect(await balanceOf(prisma, SYSTEM_WALLETS.BURN)).toBe(20);
  });

  it('Coin ไม่พอ = ไม่สร้างอะไรเลย และลงเกินยอดรางวัลรวมไม่ได้', async () => {
    const { agent, wallet } = await makeUser(app, { balance: 30 });
    await agent.post('/surveys').send({ ...base, ownerContribution: 50 }).expect(400);
    expect(await prisma.survey.count()).toBe(0);
    expect(await balanceOf(prisma, wallet.id)).toBe(30);
    const r = await agent.post('/surveys').send({ ...base, quota: 10, ownerContribution: 21 }).expect(400);
    expect(r.body.message).toMatch(/สูงสุด 20/);
    await agent.post('/surveys').send({ ...base, ownerContribution: 1 }).expect(400); // ต่ำกว่ารางวัล 1 คน
  });

  it('ระบบสมทบ: ต้องยืนยัน CMU, รอแอดมินอนุมัติ, สมทบครึ่งหนึ่งสูงสุด 100 และใช้ได้ครั้งเดียว', async () => {
    const nonCmu = await makeUser(app, { cmu: false });
    const r = await nonCmu.agent.post('/surveys').send({ ...base, ownerContribution: 100, requestSubsidy: true }).expect(400);
    expect(r.body.message).toMatch(/cmu\.ac\.th/);

    const owner = await makeUser(app, { balance: 300 });
    const admin = await makeUser(app, { role: 'ADMIN' });
    // กรณี A: 2 Coin × 100 คน = 200 → ระบบสมทบ 100, ผู้โพสต์ลง 100
    const s = (await owner.agent.post('/surveys').send({ ...base, ownerContribution: 100, requestSubsidy: true }).expect(201)).body;
    expect(s).toMatchObject({ status: 'PENDING_REVIEW', subsidyStatus: 'PENDING', subsidyAmount: 100, remainingToFund: 0 });

    const respondent = await makeUser(app);
    await respondent.agent.post(`/surveys/${s.id}/responses`).expect(400); // ยังรอตรวจ

    await owner.agent.get('/admin/subsidies').expect(403);
    const pending = (await admin.agent.get('/admin/subsidies').expect(200)).body;
    expect(pending.map((p: { id: string }) => p.id)).toEqual([s.id]);
    await admin.agent.post(`/admin/surveys/${s.id}/subsidy`).send({ approve: true }).expect(200);
    await admin.agent.post(`/admin/surveys/${s.id}/subsidy`).send({ approve: true }).expect(409);

    const after = (await owner.agent.get(`/surveys/${s.id}`).expect(200)).body;
    expect(after).toMatchObject({ status: 'OPEN', subsidyStatus: 'APPROVED', escrowBalance: 200, funded: { owner: 100, system: 100, sponsors: 0 } });

    // ขอซ้ำไม่ได้
    const again = await owner.agent.post('/surveys').send({ ...base, ownerContribution: 50, requestSubsidy: true }).expect(400);
    expect(again.body.message).toMatch(/ใช้สิทธิ์/);
    // เพดาน 100: 5 × 100 = 500 → สมทบ 100 ไม่ใช่ 250
    const other = await makeUser(app, { balance: 500 });
    const big = (await other.agent.post('/surveys').send({ ...base, rewardPerResponse: 5, ownerContribution: 100, requestSubsidy: true }).expect(201)).body;
    expect(big.subsidyAmount).toBe(100);
    expect(big.remainingToFund).toBe(300);
  });

  it('แอดมินปฏิเสธการสมทบ → เปิดรับได้ตามปกติ และยอดที่จองไว้กลับมาให้เพื่อนเติมได้', async () => {
    const owner = await makeUser(app);
    const admin = await makeUser(app, { role: 'ADMIN' });
    const s = (await owner.agent.post('/surveys').send({ ...base, ownerContribution: 100, requestSubsidy: true }).expect(201)).body;
    await admin.agent.post(`/admin/surveys/${s.id}/subsidy`).send({ approve: false, note: 'ไม่ใช่งานวิจัย' }).expect(200);
    const d = (await owner.agent.get(`/surveys/${s.id}`).expect(200)).body;
    expect(d).toMatchObject({ status: 'OPEN', subsidyStatus: 'REJECTED', subsidyAmount: 0, remainingToFund: 100, subsidyNote: 'ไม่ใช่งานวิจัย' });
  });

  it('สิทธิ์สมทบหมดเมื่อครบ 50 แบบสอบถาม', async () => {
    const filler = await makeUser(app, { balance: 0 });
    const escrows = await Promise.all(Array.from({ length: 50 }, () => prisma.wallet.create({ data: { kind: 'ESCROW' } })));
    await prisma.survey.createMany({
      data: escrows.map((w) => ({
        ownerId: filler.user.id, title: 'x', questionCount: 1, rewardPerResponse: 2, quota: 1, targetPool: 2,
        postFee: 0, status: 'CLOSED', subsidyStatus: 'APPROVED', escrowWalletId: w.id, closesAt: new Date(),
      })),
    });
    const owner = await makeUser(app);
    const q = (await owner.agent.get('/surveys/quote').expect(200)).body;
    expect(q.subsidy).toMatchObject({ eligible: false, remainingSlots: 0 });
    await owner.agent.post('/surveys').send({ ...base, ownerContribution: 100, requestSubsidy: true }).expect(400);
  });

  it('เพื่อนสนับสนุนได้ไม่เกินยอดที่ขาด ผู้สนับสนุนตอบไม่ได้ และตอบแล้วสนับสนุนไม่ได้', async () => {
    const owner = await makeUser(app);
    const friend = await makeUser(app, { balance: 500 });
    const s = (await owner.agent.post('/surveys').send({ ...base, rewardPerResponse: 5, ownerContribution: 100 }).expect(201)).body;
    const r = await friend.agent.post(`/surveys/${s.id}/sponsor`).send({ amount: 401 }).expect(400);
    expect(r.body.message).toMatch(/ไม่เกิน 400/);
    const d = (await friend.agent.post(`/surveys/${s.id}/sponsor`).send({ amount: 150 }).expect(200)).body;
    expect(d).toMatchObject({ myContribution: 150, remainingToFund: 250, funded: { sponsors: 150, sponsorCount: 1 }, canRespond: false });
    await friend.agent.post(`/surveys/${s.id}/sponsor`).send({ amount: 50 }).expect(200); // ลงเพิ่มได้ รวมเป็นแถวเดียว
    expect(await prisma.surveyContribution.count({ where: { surveyId: s.id, kind: 'SPONSOR' } })).toBe(1);

    const rr = await friend.agent.post(`/surveys/${s.id}/responses`).expect(400);
    expect(rr.body.message).toMatch(/สนับสนุน/);
    await owner.agent.post(`/surveys/${s.id}/responses`).expect(400);

    const resp = await makeUser(app);
    await resp.agent.post(`/surveys/${s.id}/responses`).expect(200);
    await resp.agent.post(`/surveys/${s.id}/sponsor`).send({ amount: 10 }).expect(400);
  });

  it('จ่ายรางวัล: ต้องยืนยัน CMU, ตอบได้ครั้งเดียว, Coin ใน Escrow หมดแล้วรับเพิ่มไม่ได้', async () => {
    const owner = await makeUser(app);
    const s = (await owner.agent.post('/surveys').send({ ...base, rewardPerResponse: 10, quota: 5, ownerContribution: 20 }).expect(201)).body;
    const nonCmu = await makeUser(app, { cmu: false });
    expect((await nonCmu.agent.post(`/surveys/${s.id}/responses`).expect(400)).body.message).toMatch(/cmu\.ac\.th/);

    const a = await makeUser(app, { balance: 0 });
    expect((await a.agent.post(`/surveys/${s.id}/responses`).expect(200)).body).toEqual({ reward: 10, balance: 10 });
    await a.agent.post(`/surveys/${s.id}/responses`).expect(409);
    const b = await makeUser(app);
    await b.agent.post(`/surveys/${s.id}/responses`).expect(200);
    const c = await makeUser(app);
    expect((await c.agent.post(`/surveys/${s.id}/responses`).expect(400)).body.message).toMatch(/หมดแล้ว/);
    // ผู้โพสต์เติม แล้วคนที่ 3 ตอบได้
    await owner.agent.post(`/surveys/${s.id}/sponsor`).send({ amount: 10 }).expect(200);
    await c.agent.post(`/surveys/${s.id}/responses`).expect(200);
    expect((await owner.agent.get(`/surveys/${s.id}`)).body).toMatchObject({ responsesCount: 3, escrowBalance: 0, funded: { owner: 30 } });
  });

  it('กรณี C: ตอบ 60 จาก 100 คน แล้วหมดเวลา → คืน 200 Coin ตามสัดส่วน 1:1:3 (40 ต่อราย)', async () => {
    const owner = await makeUser(app, { balance: 100 });
    const admin = await makeUser(app, { role: 'ADMIN' });
    const friends = await Promise.all([1, 2, 3].map(() => makeUser(app, { balance: 100 })));
    const s = (await owner.agent.post('/surveys').send({ ...base, rewardPerResponse: 5, ownerContribution: 100, requestSubsidy: true }).expect(201)).body;
    await admin.agent.post(`/admin/surveys/${s.id}/subsidy`).send({ approve: true }).expect(200);
    for (const f of friends) await f.agent.post(`/surveys/${s.id}/sponsor`).send({ amount: 100 }).expect(200);
    expect((await owner.agent.get(`/surveys/${s.id}`)).body).toMatchObject({ escrowBalance: 500, remainingToFund: 0 });

    for (let i = 0; i < 60; i++) {
      const r = await makeUser(app, { balance: 0 });
      await surveys.recordResponse(r.user.id, s.id);
    }
    const burnBefore = await balanceOf(prisma, SYSTEM_WALLETS.BURN);
    await prisma.survey.update({ where: { id: s.id }, data: { closesAt: new Date(Date.now() - 1000) } });
    expect(await surveys.closeExpired()).toBe(1);

    const d = (await owner.agent.get(`/surveys/${s.id}`)).body;
    expect(d).toMatchObject({ status: 'CLOSED', responsesCount: 60, escrowBalance: 0 });
    expect(await balanceOf(prisma, owner.wallet.id)).toBe(40);
    for (const f of friends) expect(await balanceOf(prisma, f.wallet.id)).toBe(40);
    expect(await balanceOf(prisma, SYSTEM_WALLETS.BURN)).toBe(burnBefore + 40); // ส่วนของระบบกลับเข้าระบบ
    expect(await surveys.closeExpired()).toBe(0);
  });

  it('ครบโควตาแล้วปิดเองและคืนส่วนเกิน / ผู้โพสต์กดปิดเองได้ คนอื่นปิดไม่ได้', async () => {
    const owner = await makeUser(app, { balance: 100 });
    const s = (await owner.agent.post('/surveys').send({ ...base, rewardPerResponse: 10, quota: 2, ownerContribution: 20 }).expect(201)).body;
    for (let i = 0; i < 2; i++) await (await makeUser(app)).agent.post(`/surveys/${s.id}/responses`).expect(200);
    expect((await owner.agent.get(`/surveys/${s.id}`)).body.status).toBe('CLOSED');

    const s2 = (await owner.agent.post('/surveys').send({ ...base, rewardPerResponse: 10, quota: 5, ownerContribution: 50 }).expect(201)).body;
    const before = await balanceOf(prisma, owner.wallet.id);
    await (await makeUser(app)).agent.post(`/surveys/${s2.id}/close`).expect(403);
    await (await makeUser(app)).agent.post(`/surveys/${s2.id}/responses`).expect(200);
    const closed = (await owner.agent.post(`/surveys/${s2.id}/close`).expect(200)).body;
    expect(closed).toMatchObject({ status: 'CLOSED', escrowBalance: 0 });
    expect(await balanceOf(prisma, owner.wallet.id)).toBe(before + 40); // ค่าโพสต์ไม่คืน
    await owner.agent.post(`/surveys/${s2.id}/close`).expect(400);
  });

  it('ปิดก่อนแอดมินตรวจ → สิทธิ์สมทบไม่ถูกใช้', async () => {
    const owner = await makeUser(app);
    const s = (await owner.agent.post('/surveys').send({ ...base, ownerContribution: 100, requestSubsidy: true }).expect(201)).body;
    await owner.agent.post(`/surveys/${s.id}/close`).expect(200);
    expect((await owner.agent.get('/surveys/quote')).body.subsidy.eligible).toBe(true);
    expect(await balanceOf(prisma, owner.wallet.id)).toBe(100);
  });

  it('ยิงตอบพร้อมกัน 25 คน แต่โควตา 10 → จ่ายพอดี 10 คนแล้วปิด', async () => {
    const owner = await makeUser(app, { balance: 100 });
    const s = (await owner.agent.post('/surveys').send({ ...base, rewardPerResponse: 5, quota: 10, ownerContribution: 50 }).expect(201)).body;
    const users = await Promise.all(Array.from({ length: 25 }, () => makeUser(app, { balance: 0 })));
    const results = await Promise.allSettled(users.map((u) => surveys.recordResponse(u.user.id, s.id)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    const d = await prisma.survey.findUniqueOrThrow({ where: { id: s.id }, include: { escrowWallet: true } });
    expect(d).toMatchObject({ status: 'CLOSED', responsesCount: 10 });
    expect(d.escrowWallet.balance).toBe(0);
    expect(await prisma.surveyResponse.count({ where: { surveyId: s.id } })).toBe(10);
  });

  it('รายการแบบสอบถามที่เปิดอยู่ และของฉัน', async () => {
    const owner = await makeUser(app);
    const s = (await owner.agent.post('/surveys').send({ ...base, ownerContribution: 20 }).expect(201)).body;
    const other = await makeUser(app);
    const list = (await other.agent.get('/surveys').expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: s.id, payableResponses: 10, ownerName: owner.user.displayName });
    expect((await other.agent.get('/surveys/mine').expect(200)).body).toHaveLength(0);
    expect((await owner.agent.get('/surveys/mine').expect(200)).body).toHaveLength(1);
    await other.agent.get('/surveys/nope').expect(404);
  });
});
