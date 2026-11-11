import { INestApplication } from '@nestjs/common';
import { validateAnswers } from '@tembo/shared';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertLedgerInvariant, createTestApp, makeUser, resetDb } from './helpers';

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const questions = [
  { type: 'SINGLE_CHOICE', title: 'นอนวันละกี่ชั่วโมง', required: true, options: ['< 5', '5–7', '> 7'] },
  { type: 'MULTI_CHOICE', title: 'ใช้อะไรช่วยให้ตื่น', required: true, options: ['กาแฟ', 'ชา', 'เครื่องดื่มชูกำลัง'] },
  { type: 'SCALE', title: 'ความเครียดช่วงสอบ', required: true, options: [], scaleMax: 5, minLabel: 'น้อย', maxLabel: 'มาก' },
  { type: 'SHORT_TEXT', title: 'คณะ/สาขา', required: false, options: [] },
  { type: 'LONG_TEXT', title: 'ข้อเสนอแนะ', required: false, options: [] },
];
const body = { title: 'การนอนของนักศึกษา', description: 'ใช้เวลา 3 นาที', questions, rewardPerResponse: 5, quota: 10, closesAt: inDays(7), ownerContribution: 50 };

describe('Surveys: คำถาม / แบบฟอร์ม / ผลลัพธ์ (ขั้นที่ 3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => ({ app, prisma } = await createTestApp()));
  beforeEach(async () => resetDb(prisma));
  afterEach(async () => assertLedgerInvariant(prisma));
  afterAll(async () => app.close());

  async function setup() {
    const owner = await makeUser(app, { name: 'ผู้วิจัย' });
    const s = (await owner.agent.post('/surveys').send(body).expect(201)).body;
    const form = (await owner.agent.get(`/surveys/${s.id}/form`).expect(200)).body;
    const ids: string[] = form.questions.map((q: { id: string }) => q.id);
    return { owner, s, form, ids };
  }

  it('สร้างพร้อมคำถามหลายแบบ จำนวนข้อนับจากคำถามจริง', async () => {
    const { s, form } = await setup();
    expect(s.questionCount).toBe(5);
    expect(form.questions.map((q: { type: string }) => q.type)).toEqual(['SINGLE_CHOICE', 'MULTI_CHOICE', 'SCALE', 'SHORT_TEXT', 'LONG_TEXT']);
    expect(form.questions[2]).toMatchObject({ scaleMax: 5, minLabel: 'น้อย', maxLabel: 'มาก', options: [] });
  });

  it('ตรวจคำถาม: เลือกตอบต้องมี ≥2 ตัวเลือกไม่ซ้ำ, มาตรวัด 5/7/10, ต้องมีอย่างน้อย 1 คำถาม', async () => {
    const { agent } = await makeUser(app);
    const bad = (q: object) => agent.post('/surveys').send({ ...body, questions: [q] }).expect(400);
    expect((await bad({ type: 'SINGLE_CHOICE', title: 'x', options: ['a'] })).body.message).toMatch(/2 ตัวเลือก/);
    expect((await bad({ type: 'MULTI_CHOICE', title: 'x', options: ['a', 'a'] })).body.message).toMatch(/ซ้ำ/);
    expect((await bad({ type: 'SCALE', title: 'x', scaleMax: 4 })).body.message).toMatch(/5, 7/);
    await agent.post('/surveys').send({ ...body, questions: [] }).expect(400);
  });

  it('แบบฟอร์ม: ผู้ที่ตอบได้เห็นคำถาม, ผู้ที่ยังไม่ยืนยัน CMU ดูไม่ได้', async () => {
    const { s } = await setup();
    const ok = await makeUser(app);
    expect((await ok.agent.get(`/surveys/${s.id}/form`).expect(200)).body.questions).toHaveLength(5);
    const nonCmu = await makeUser(app, { cmu: false });
    await nonCmu.agent.get(`/surveys/${s.id}/form`).expect(403);
  });

  it('ส่งคำตอบ: ตรวจข้อบังคับ/ตัวเลือก/ช่วงคะแนน แล้วเก็บคำตอบที่ทำความสะอาดแล้ว', async () => {
    const { s, ids } = await setup();
    const r = await makeUser(app, { balance: 0 });
    const send = (answers: object) => r.agent.post(`/surveys/${s.id}/responses`).send({ answers });

    const missing = (await send({ [ids[0]]: 1 }).expect(400)).body;
    expect(missing.errors).toMatchObject({ [ids[1]]: 'ต้องตอบข้อนี้', [ids[2]]: 'ต้องตอบข้อนี้' });
    await send({ [ids[0]]: 3, [ids[1]]: [0], [ids[2]]: 3 }).expect(400); // ตัวเลือกไม่มีอยู่
    await send({ [ids[0]]: 0, [ids[1]]: [0], [ids[2]]: 6 }).expect(400); // เกิน 5 คะแนน
    await send({ [ids[0]]: 0, [ids[1]]: [0], [ids[2]]: 3, unknown: 'x' }).expect(400);
    await send({ [ids[0]]: '0', [ids[1]]: [0], [ids[2]]: 3 }).expect(400); // ชนิดผิด
    expect(await prisma.surveyResponse.count()).toBe(0);

    const ok = await send({ [ids[0]]: 1, [ids[1]]: [2, 0, 2], [ids[2]]: 4, [ids[3]]: '  วิศวะ  ', [ids[4]]: '' }).expect(200);
    expect(ok.body).toEqual({ reward: 5, balance: 5 });
    const saved = await prisma.surveyResponse.findFirstOrThrow();
    expect(saved.answers).toEqual({ [ids[0]]: 1, [ids[1]]: [0, 2], [ids[2]]: 4, [ids[3]]: 'วิศวะ' });
  });

  it('ผลลัพธ์: นับตัวเลือก ค่าเฉลี่ยมาตรวัด ข้อความ และแยกตามคณะ — เฉพาะผู้โพสต์/แอดมิน', async () => {
    const { owner, s, ids } = await setup();
    const answers = [
      { [ids[0]]: 0, [ids[1]]: [0, 1], [ids[2]]: 5, [ids[4]]: 'อยากให้ห้องสมุดเปิดดึก' },
      { [ids[0]]: 2, [ids[1]]: [0], [ids[2]]: 2 },
      { [ids[0]]: 2, [ids[1]]: [2], [ids[2]]: 4, [ids[3]]: 'บริหาร' },
    ];
    for (const a of answers) await (await makeUser(app)).agent.post(`/surveys/${s.id}/responses`).send({ answers: a }).expect(200);

    const res = (await owner.agent.get(`/surveys/${s.id}/results`).expect(200)).body;
    expect(res.responses).toBe(3);
    expect(res.questions[0]).toMatchObject({ kind: 'choice', answered: 3, counts: [1, 0, 2] });
    expect(res.questions[1]).toMatchObject({ kind: 'choice', answered: 3, counts: [2, 1, 1] });
    expect(res.questions[2]).toMatchObject({ kind: 'scale', counts: [0, 1, 0, 1, 1], average: 3.67 });
    expect(res.questions[3]).toMatchObject({ kind: 'text', answered: 1, samples: ['บริหาร'] });
    expect(res.byFaculty).toEqual([{ faculty: 'ไม่ระบุ', count: 3 }]);
    expect(JSON.stringify(res)).not.toMatch(/@test\.dev|@cmu\.ac\.th/); // ไม่มีอีเมลผู้ตอบ

    await (await makeUser(app)).agent.get(`/surveys/${s.id}/results`).expect(403);
    await (await makeUser(app, { role: 'ADMIN' })).agent.get(`/surveys/${s.id}/results`).expect(200);
  });

  it('ดาวน์โหลด CSV: มี BOM, แปลงตัวเลือกเป็นข้อความ, escape เครื่องหมายจุลภาค/อัญประกาศ', async () => {
    const { owner, s, ids } = await setup();
    await (await makeUser(app)).agent.post(`/surveys/${s.id}/responses`)
      .send({ answers: { [ids[0]]: 1, [ids[1]]: [0, 2], [ids[2]]: 3, [ids[4]]: 'ดี, แต่ "ช้า"' } }).expect(200);
    const res = await owner.agent.get(`/surveys/${s.id}/results.csv`).expect(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="tembo-survey-/);
    const text: string = res.text;
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const [header, row] = text.slice(1).split('\r\n');
    expect(header).toBe('ลำดับ,เวลาที่ตอบ,คณะ,ชั้นปี,Q1. นอนวันละกี่ชั่วโมง,Q2. ใช้อะไรช่วยให้ตื่น,Q3. ความเครียดช่วงสอบ,Q4. คณะ/สาขา,Q5. ข้อเสนอแนะ');
    expect(row).toMatch(/^1,.+,5–7,กาแฟ \| เครื่องดื่มชูกำลัง,3,,"ดี, แต่ ""ช้า"""$/);
    await (await makeUser(app)).agent.get(`/surveys/${s.id}/results.csv`).expect(403);
  });

  it('แบบสอบถามเก่าที่ไม่มีคำถาม ตอบไม่ได้', async () => {
    const { s } = await setup();
    await prisma.surveyQuestion.deleteMany({ where: { surveyId: s.id } });
    const r = await makeUser(app);
    const d = (await r.agent.get(`/surveys/${s.id}`).expect(200)).body;
    expect(d).toMatchObject({ canRespond: false, respondBlockedReason: expect.stringMatching(/ยังไม่มีคำถาม/) });
    await r.agent.post(`/surveys/${s.id}/responses`).send({ answers: {} }).expect(400);
  });

  it('validateAnswers (ใช้ร่วมกับหน้าเว็บ)', () => {
    const q = [{ id: 'a', type: 'LONG_TEXT' as const, required: false, options: [], scaleMax: null }];
    expect(validateAnswers(q, { a: 'x'.repeat(3001) }).errors.a).toMatch(/3000/);
    expect(validateAnswers(q, {}).ok).toBe(true);
  });
});
