import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, makeUser, resetDb } from './helpers';

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const event = { title: 'งานทดสอบ', description: 'รายละเอียดงานทดสอบ', hostName: 'ชมรม', category: 'CLUB', location: 'มช.', startsAt: inHours(48), endsAt: inHours(50) };
const survey = (o: Record<string, unknown> = {}) => ({
  title: 'แบบสอบถาม', questions: [{ type: 'SHORT_TEXT', title: 'ข้อ 1', required: true, options: [] }],
  rewardPerResponse: 2, quota: 1, closesAt: inHours(48), ownerContribution: 1, ...o,
});

describe('แจ้งเตือน + บันทึกแบบสอบถาม', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => { ({ app, prisma } = await createTestApp()); });
  beforeEach(async () => resetDb(prisma));
  afterAll(async () => app.close());

  it('Event: อนุมัติ → แจ้งผู้จัด, เลื่อนคิว → แจ้งคนที่ได้ที่, ยกเลิก → แจ้งผู้ลงทะเบียนทุกคน', async () => {
    const org = await makeUser(app);
    const admin = await makeUser(app, { role: 'ADMIN', balance: 0 });
    const [a, b] = await Promise.all([makeUser(app), makeUser(app)]);
    const ev = (await org.agent.post('/events').send({ ...event, capacity: 1 }).expect(201)).body;
    await admin.agent.post(`/admin/events/${ev.id}/review`).send({ approve: true }).expect(200);
    const n1 = (await org.agent.get('/notifications').expect(200)).body;
    expect(n1).toMatchObject({ unread: 1, items: [{ type: 'EVENT_APPROVED', link: `/events/${ev.id}`, read: false }] });

    await a.agent.post(`/events/${ev.id}/register`).expect(200);
    await b.agent.post(`/events/${ev.id}/register`).expect(200);
    await a.agent.delete(`/events/${ev.id}/register`).expect(200);
    expect((await b.agent.get('/notifications').expect(200)).body.items[0].type).toBe('WAITLIST_PROMOTED');

    await org.agent.post(`/events/${ev.id}/cancel`).expect(200);
    expect((await b.agent.get('/notifications/unread-count').expect(200)).body.unread).toBe(2);
    expect((await a.agent.get('/notifications').expect(200)).body.items).toHaveLength(0);

    // อ่านทีละรายการ / อ่านทั้งหมด / ดูเฉพาะที่ยังไม่อ่าน
    const items = (await b.agent.get('/notifications').expect(200)).body.items;
    expect((await b.agent.post(`/notifications/${items[0].id}/read`).expect(200)).body.unread).toBe(1);
    expect((await b.agent.get('/notifications?unread=1').expect(200)).body.items).toHaveLength(1);
    await a.agent.post(`/notifications/${items[1].id}/read`).expect(200); // ของคนอื่น → ไม่มีผล
    expect((await b.agent.post('/notifications/read-all').expect(200)).body.unread).toBe(0);
  });

  it('แบบสอบถาม: เพื่อนสนับสนุน / ปิดรับ → แจ้งผู้โพสต์', async () => {
    const owner = await makeUser(app);
    const friend = await makeUser(app);
    const s = (await owner.agent.post('/surveys').send(survey({ quota: 2, ownerContribution: 2 })).expect(201)).body;
    await friend.agent.post(`/surveys/${s.id}/sponsor`).send({ amount: 2 }).expect(200);
    await owner.agent.post(`/surveys/${s.id}/close`).expect(200);
    const types = (await owner.agent.get('/notifications').expect(200)).body.items.map((i: { type: string }) => i.type);
    expect(types).toEqual(['SURVEY_CLOSED', 'SURVEY_SPONSORED']);
  });

  it('บันทึก / เลิกบันทึก แบบสอบถาม', async () => {
    const owner = await makeUser(app);
    const u = await makeUser(app);
    const s = (await owner.agent.post('/surveys').send(survey({ quota: 5, ownerContribution: 10 })).expect(201)).body;
    await u.agent.post(`/surveys/${s.id}/save`).expect(200);
    await u.agent.post(`/surveys/${s.id}/save`).expect(200);
    expect((await u.agent.get('/surveys/saved').expect(200)).body).toMatchObject([{ id: s.id, saved: true }]);
    expect((await u.agent.get('/surveys').expect(200)).body[0].saved).toBe(true);
    expect((await u.agent.get(`/surveys/${s.id}`).expect(200)).body.saved).toBe(true);
    await u.agent.delete(`/surveys/${s.id}/save`).expect(200);
    expect((await u.agent.get('/surveys/saved').expect(200)).body).toHaveLength(0);
    await u.agent.post('/surveys/nope/save').expect(404);
  });
});
