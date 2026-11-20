import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, makeUser, resetDb } from './helpers';

describe('ฉบับร่างแบบสอบถาม + 2 ภาษา', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => { ({ app, prisma } = await createTestApp()); });
  beforeEach(async () => resetDb(prisma));
  afterAll(async () => app.close());

  it('บันทึก / แก้ / เปิด / ลบ ฉบับร่าง — เห็นเฉพาะเจ้าของ', async () => {
    const a = await makeUser(app);
    const b = await makeUser(app);
    const d = (await a.agent.post('/survey-drafts').send({ title: 'ร่าง 1', stepsDone: 1, data: { title: 'ร่าง 1', quota: 50 } }).expect(201)).body;
    expect(d).toMatchObject({ title: 'ร่าง 1', stepsDone: 1 });
    await a.agent.put(`/survey-drafts/${d.id}`).send({ title: 'ร่าง 1 แก้', stepsDone: 3, data: { title: 'ร่าง 1 แก้' } }).expect(200);
    expect((await a.agent.get('/survey-drafts').expect(200)).body).toEqual([expect.objectContaining({ id: d.id, title: 'ร่าง 1 แก้', stepsDone: 3 })]);
    expect((await a.agent.get(`/survey-drafts/${d.id}`).expect(200)).body.data).toEqual({ title: 'ร่าง 1 แก้' });
    await b.agent.get(`/survey-drafts/${d.id}`).expect(404);
    await b.agent.put(`/survey-drafts/${d.id}`).send({ title: 'x', stepsDone: 0, data: {} }).expect(404);
    expect((await b.agent.get('/survey-drafts').expect(200)).body).toHaveLength(0);
    await a.agent.post('/survey-drafts').send({ title: 'ใหญ่', stepsDone: 0, data: { x: 'ก'.repeat(25_000) } }).expect(400);
    await a.agent.delete(`/survey-drafts/${d.id}`).expect(200);
    expect((await a.agent.get('/survey-drafts').expect(200)).body).toHaveLength(0);
  });

  it('ข้อความจากเซิร์ฟเวอร์ตามภาษา: error, ป้าย, ประวัติ Coin', async () => {
    const en = await makeUser(app, { lang: 'en', balance: 0 });
    const th = await makeUser(app, { lang: 'th', balance: 0 });
    expect((await en.agent.get('/surveys/nope').expect(404)).body.message).toBe('Survey not found');
    expect((await th.agent.get('/surveys/nope').expect(404)).body.message).toBe('ไม่พบแบบสอบถาม');
    // zod ข้อความพื้นฐาน
    const v = (await en.agent.post('/survey-drafts').send({ stepsDone: 9, data: {} }).expect(400)).body.message;
    expect(v).not.toMatch(/[฀-๿]/);
    const vt = (await th.agent.post('/survey-drafts').send({ stepsDone: 9, data: {} }).expect(400)).body.message;
    expect(vt).toMatch(/ต้องไม่เกิน 4/);
    // memo ใน ledger
    const admin = await makeUser(app, { role: 'ADMIN', lang: 'en' });
    await admin.agent.post('/admin/coins/grant').send({ email: en.user.email, amount: 5, memo: 'test' }).expect(200);
    await admin.agent.post('/admin/coins/grant').send({ email: th.user.email, amount: 5, memo: 'test' }).expect(200);
    expect((await en.agent.get('/me/wallet').expect(200)).body.entries[0].memo).toMatch(/\(by /);
    expect((await th.agent.get('/me/wallet').expect(200)).body.entries[0].memo).toMatch(/\(โดย /);
  });
});
