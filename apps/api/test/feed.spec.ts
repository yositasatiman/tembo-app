import { INestApplication } from '@nestjs/common';
import { scoreFeedItem, type SurveySummary } from '@tembo/shared';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, makeUser, resetDb } from './helpers';

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const qs = (n: number) => Array.from({ length: n }, (_, i) => ({ type: 'SINGLE_CHOICE', title: `ข้อ ${i + 1}`, required: true, options: ['ใช่', 'ไม่'] }));
const survey = (o: Record<string, unknown> = {}) => ({ title: 'แบบสอบถาม', questions: qs(5), rewardPerResponse: 5, quota: 10, closesAt: inDays(10), ownerContribution: 50, ...o });
const event = (o: Record<string, unknown> = {}) => ({
  title: 'งานทดสอบ', description: 'รายละเอียดงานทดสอบ', hostName: 'ชมรม', category: 'CLUB', location: 'มช.',
  startsAt: inDays(10), endsAt: new Date(Date.now() + 10 * 86_400_000 + 3_600_000).toISOString(), ...o,
});

describe('ฟีดรวม + จับคู่ความสนใจ', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => { ({ app, prisma } = await createTestApp()); });
  beforeEach(async () => resetDb(prisma));
  afterAll(async () => app.close());

  it('คะแนน: ความสนใจ 1 หัวข้อชนะรางวัลสูงสุด', () => {
    const base = { tags: [], ownerFaculty: 'วิทยาศาสตร์', questionCount: 5, closesAt: inDays(10) } as unknown as SurveySummary;
    const viewer = { interests: ['ดนตรี'], faculty: 'สังคมศาสตร์' };
    const rich = scoreFeedItem({ kind: 'survey', survey: { ...base, rewardPerResponse: 1000 } }, viewer);
    const match = scoreFeedItem({ kind: 'survey', survey: { ...base, tags: ['ดนตรี'], rewardPerResponse: 2 } }, viewer);
    expect(rich.score).toBe(1.5);
    expect(rich.relevant).toBe(false);
    expect(match.score).toBeGreaterThan(rich.score);
    expect(match.reasons).toContain('สนใจดนตรี');
  });

  it('all = ใหม่สุดก่อน ไม่รวมของตัวเองและที่ตอบแล้ว / foryou = เฉพาะที่ตรงความสนใจหรือคณะ เรียงตามคะแนน', async () => {
    const viewer = await makeUser(app);
    await prisma.user.update({ where: { id: viewer.user.id }, data: { interests: ['ดนตรี', 'อาหาร'], faculty: 'สังคมศาสตร์' } });
    const a = await makeUser(app, { balance: 500 });
    const admin = await makeUser(app, { role: 'ADMIN', balance: 0 });
    await prisma.user.update({ where: { id: a.user.id }, data: { faculty: 'วิทยาศาสตร์' } });

    const sMusic = (await a.agent.post('/surveys').send(survey({ title: 'ดนตรี', tags: ['ดนตรี'] })).expect(201)).body;
    const sRich = (await a.agent.post('/surveys').send(survey({ title: 'รางวัลสูง', rewardPerResponse: 20, quota: 5, ownerContribution: 100 })).expect(201)).body;
    const ev = (await a.agent.post('/events').send(event({ tags: ['อาหาร', 'ดนตรี'] })).expect(201)).body;
    await admin.agent.post(`/admin/events/${ev.id}/review`).send({ approve: true }).expect(200);
    await viewer.agent.post('/surveys').send(survey({ title: 'ของฉัน', tags: ['ดนตรี'] })).expect(201);

    const all = (await viewer.agent.get('/feed').expect(200)).body;
    expect(all.map((i: { id: string }) => i.id)).toEqual([ev.id, sRich.id, sMusic.id]);

    const mine = (await viewer.agent.get('/feed?tab=foryou').expect(200)).body;
    expect(mine.map((i: { id: string }) => i.id)).toEqual([ev.id, sMusic.id]);
    expect(mine[0].reasons).toEqual(expect.arrayContaining(['สนใจอาหาร', 'สนใจดนตรี']));

    // ตอบแล้วหายจากฟีด
    const questions = await prisma.surveyQuestion.findMany({ where: { surveyId: sMusic.id } });
    await viewer.agent.post(`/surveys/${sMusic.id}/responses`).send({ answers: Object.fromEntries(questions.map((q) => [q.id, 0])) }).expect(200);
    expect((await viewer.agent.get('/feed?tab=foryou').expect(200)).body.map((i: { id: string }) => i.id)).toEqual([ev.id]);
  });
});
