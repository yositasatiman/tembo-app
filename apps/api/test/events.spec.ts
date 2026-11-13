import { INestApplication } from '@nestjs/common';
import { SYSTEM_WALLETS } from '@tembo/db';
import { EventsService } from '../src/events/events.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertLedgerInvariant, balanceOf, createTestApp, makeUser, resetDb } from './helpers';

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
const base = {
  title: 'Campus Night Market',
  description: 'ตลาดนัดกลางคืนของนักศึกษา มีอาหารและดนตรีสด',
  hostName: 'สโมสรนักศึกษา มช.',
  category: 'UNIVERSITY',
  tags: ['อาหาร', 'ดนตรี'],
  location: 'อ่างแก้ว มช.',
  startsAt: inHours(48),
  endsAt: inHours(52),
};

describe('Events: ค่าโพสต์ / แอดมินอนุมัติ / ลงทะเบียน / คิวรอ / เช็กอิน / คืน Coin', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: EventsService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    events = app.get(EventsService);
  });
  beforeEach(async () => resetDb(prisma));
  afterEach(async () => assertLedgerInvariant(prisma));
  afterAll(async () => app.close());

  /** สร้าง Event แล้วให้แอดมินอนุมัติ */
  async function publish(body: Record<string, unknown> = {}, organizerBalance = 100) {
    const org = await makeUser(app, { balance: organizerBalance, name: 'Organizer' });
    const admin = await makeUser(app, { role: 'ADMIN', balance: 0 });
    const ev = (await org.agent.post('/events').send({ ...base, ...body }).expect(201)).body;
    await admin.agent.post(`/admin/events/${ev.id}/review`).send({ approve: true }).expect(200);
    return { org, admin, ev };
  }

  /** ย้ายเวลา Event ให้อยู่ในช่วงเช็กอิน */
  const startNow = (id: string) => prisma.event.update({ where: { id }, data: { startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 3_600_000) } });

  it('ตรวจข้อมูล: เวลา, รางวัลต้องมีจำนวนคน, ลิงก์ต้องเป็น https', async () => {
    const { agent } = await makeUser(app);
    await agent.post('/events').send({ ...base, startsAt: inHours(0.5) }).expect(400);
    await agent.post('/events').send({ ...base, endsAt: base.startsAt }).expect(400);
    await agent.post('/events').send({ ...base, rewardPerCheckIn: 5 }).expect(400);
    await agent.post('/events').send({ ...base, capacity: 10, rewardPerCheckIn: 5, rewardSlots: 11 }).expect(400);
    await agent.post('/events').send({ ...base, registrationUrl: 'http://forms.gle/x' }).expect(400);
    await agent.post('/events').send({ ...base, tags: ['ไม่มีในรายการ'] }).expect(400);
  });

  it('สร้าง → ล็อกค่าโพสต์ + รางวัลใน Escrow, ยังไม่ขึ้นฟีดจนแอดมินอนุมัติ แล้วค่าโพสต์เข้า BURN', async () => {
    const org = await makeUser(app, { balance: 100 });
    const viewer = await makeUser(app);
    const admin = await makeUser(app, { role: 'ADMIN', balance: 0 });
    const ev = (await org.agent.post('/events').send({ ...base, rewardPerCheckIn: 5, rewardSlots: 10 }).expect(201)).body;
    expect(ev).toMatchObject({ status: 'PENDING_REVIEW', postFee: 10, escrowBalance: 60, isOrganizer: true });
    expect(await balanceOf(prisma, org.wallet.id)).toBe(40);

    expect((await viewer.agent.get('/events').expect(200)).body).toHaveLength(0);
    await viewer.agent.get(`/events/${ev.id}`).expect(404);
    await viewer.agent.post(`/events/${ev.id}/register`).expect(404);
    await viewer.agent.get('/admin/events').expect(403);

    expect((await admin.agent.get('/admin/events').expect(200)).body).toHaveLength(1);
    await admin.agent.post(`/admin/events/${ev.id}/review`).send({ approve: true }).expect(200);
    await admin.agent.post(`/admin/events/${ev.id}/review`).send({ approve: true }).expect(409);
    expect(await balanceOf(prisma, SYSTEM_WALLETS.BURN)).toBe(10);
    const list = (await viewer.agent.get('/events').expect(200)).body;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ status: 'PUBLISHED', rewardPerCheckIn: 5, rewardsLeft: 10, isFull: false });
  });

  it('แอดมินไม่อนุมัติ → คืน Coin ทั้งหมดรวมค่าโพสต์ / ผู้จัดยกเลิกก่อนตรวจ → คืนทั้งหมด', async () => {
    const org = await makeUser(app, { balance: 100 });
    const admin = await makeUser(app, { role: 'ADMIN', balance: 0 });
    const e1 = (await org.agent.post('/events').send({ ...base, rewardPerCheckIn: 2, rewardSlots: 10 }).expect(201)).body;
    const e2 = (await org.agent.post('/events').send(base).expect(201)).body;
    expect(await balanceOf(prisma, org.wallet.id)).toBe(100 - 30 - 10);
    await admin.agent.post(`/admin/events/${e1.id}/review`).send({ approve: false, note: 'ข้อมูลไม่ครบ' }).expect(200);
    const after = (await org.agent.post(`/events/${e2.id}/cancel`).expect(200)).body;
    expect(after.status).toBe('CANCELLED');
    expect(await balanceOf(prisma, org.wallet.id)).toBe(100);
    expect((await org.agent.get(`/events/${e1.id}`).expect(200)).body).toMatchObject({ status: 'REJECTED', reviewNote: 'ข้อมูลไม่ครบ' });
  });

  it('Coin ไม่พอจ่ายค่าโพสต์ + รางวัล → สร้างไม่ได้', async () => {
    const { agent } = await makeUser(app, { balance: 50 });
    await agent.post('/events').send({ ...base, rewardPerCheckIn: 5, rewardSlots: 10 }).expect(400);
    expect(await prisma.event.count()).toBe(0);
  });

  it('ลงทะเบียน: เต็มแล้วเข้าคิว, คนยกเลิก → คิวแรกเลื่อนขึ้น, ผู้จัดลงงานตัวเองไม่ได้', async () => {
    const { org, ev } = await publish({ capacity: 2 });
    const [a, b, c, d] = await Promise.all([1, 2, 3, 4].map(() => makeUser(app)));
    await org.agent.post(`/events/${ev.id}/register`).expect(400);

    expect((await a.agent.post(`/events/${ev.id}/register`).expect(200)).body.myStatus).toBe('REGISTERED');
    await a.agent.post(`/events/${ev.id}/register`).expect(409);
    await b.agent.post(`/events/${ev.id}/register`).expect(200);
    const cRes = (await c.agent.post(`/events/${ev.id}/register`).expect(200)).body;
    expect(cRes).toMatchObject({ myStatus: 'WAITLISTED', myWaitlistPosition: 1, isFull: true, registeredCount: 2 });
    expect((await d.agent.post(`/events/${ev.id}/register`).expect(200)).body.myWaitlistPosition).toBe(2);

    await a.agent.delete(`/events/${ev.id}/register`).expect(200);
    expect((await c.agent.get(`/events/${ev.id}`).expect(200)).body).toMatchObject({ myStatus: 'REGISTERED', registeredCount: 2 });
    expect((await d.agent.get(`/events/${ev.id}`).expect(200)).body.myWaitlistPosition).toBe(1);

    // คนในคิวยกเลิก → ไม่กระทบจำนวนที่ลงทะเบียน
    await d.agent.delete(`/events/${ev.id}/register`).expect(200);
    await b.agent.delete(`/events/${ev.id}/register`).expect(200);
    expect((await org.agent.get(`/events/${ev.id}`).expect(200)).body).toMatchObject({ registeredCount: 1, waitlistCount: 0 });

    const people = (await org.agent.get(`/events/${ev.id}/attendees`).expect(200)).body;
    expect(people).toHaveLength(1);
    await a.agent.get(`/events/${ev.id}/attendees`).expect(403);
  });

  it('ลงทะเบียนพร้อมกันหลายคน ไม่เกินจำนวนที่รับ', async () => {
    const { ev } = await publish({ capacity: 3 });
    const users = await Promise.all(Array.from({ length: 8 }, () => makeUser(app)));
    await Promise.all(users.map((u) => u.agent.post(`/events/${ev.id}/register`).expect(200)));
    expect(await prisma.eventRegistration.count({ where: { eventId: ev.id, status: 'REGISTERED' } })).toBe(3);
    expect(await prisma.eventRegistration.count({ where: { eventId: ev.id, status: 'WAITLISTED' } })).toBe(5);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: ev.id } })).registeredCount).toBe(3);
  });

  it('เช็กอินด้วยรหัสที่ถูกต้อง → ได้ Coin, รหัสผิด/คิวรอ/ซ้ำ ไม่ได้, ไม่ยืนยัน CMU ไม่ได้ Coin', async () => {
    const { org, ev } = await publish({ capacity: 3, rewardPerCheckIn: 5, rewardSlots: 2 });
    const a = await makeUser(app, { balance: 0 });
    const b = await makeUser(app, { balance: 0, cmu: false });
    const c = await makeUser(app, { balance: 0 });
    const w = await makeUser(app, { balance: 0 });
    const outsider = await makeUser(app, { balance: 0 });
    for (const u of [a, b, c]) await u.agent.post(`/events/${ev.id}/register`).expect(200);
    await w.agent.post(`/events/${ev.id}/register`).expect(200); // คิวรอ

    await org.agent.get(`/events/${ev.id}/checkin-code`).expect(400); // ยังไม่ถึงเวลา
    await startNow(ev.id);
    await a.agent.get(`/events/${ev.id}/checkin-code`).expect(403);
    const { code, checkInUrl } = (await org.agent.get(`/events/${ev.id}/checkin-code`).expect(200)).body;
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    expect(checkInUrl).toContain(`/events/${ev.id}/checkin?code=${code}`);

    const wrong = code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA';
    await a.agent.post(`/events/${ev.id}/checkin`).send({ code: wrong }).expect(400);
    const ra = (await a.agent.post(`/events/${ev.id}/checkin`).send({ code: code.toLowerCase() }).expect(200)).body;
    expect(ra).toMatchObject({ reward: 5, balance: 5, note: null });
    await a.agent.post(`/events/${ev.id}/checkin`).send({ code }).expect(409);
    await a.agent.delete(`/events/${ev.id}/register`).expect(400); // เช็กอินแล้วยกเลิกไม่ได้

    const rb = (await b.agent.post(`/events/${ev.id}/checkin`).send({ code }).expect(200)).body;
    expect(rb.reward).toBe(0);
    expect(rb.note).toMatch(/cmu/);
    expect((await c.agent.post(`/events/${ev.id}/checkin`).send({ code }).expect(200)).body.reward).toBe(5);

    await w.agent.post(`/events/${ev.id}/checkin`).send({ code }).expect(400);
    await outsider.agent.post(`/events/${ev.id}/checkin`).send({ code }).expect(400);

    const d = (await org.agent.get(`/events/${ev.id}`).expect(200)).body;
    expect(d).toMatchObject({ checkedInCount: 3, rewardedCount: 2, rewardsLeft: 0, escrowBalance: 0 });
  });

  it('รางวัลครบจำนวนแล้ว คนต่อไปเช็กอินได้แต่ไม่ได้ Coin', async () => {
    const { org, ev } = await publish({ rewardPerCheckIn: 3, rewardSlots: 1 });
    const a = await makeUser(app, { balance: 0 });
    const b = await makeUser(app, { balance: 0 });
    for (const u of [a, b]) await u.agent.post(`/events/${ev.id}/register`).expect(200);
    await startNow(ev.id);
    const { code } = (await org.agent.get(`/events/${ev.id}/checkin-code`).expect(200)).body;
    expect((await a.agent.post(`/events/${ev.id}/checkin`).send({ code }).expect(200)).body.reward).toBe(3);
    const rb = (await b.agent.post(`/events/${ev.id}/checkin`).send({ code }).expect(200)).body;
    expect(rb).toMatchObject({ reward: 0 });
    expect(rb.note).toMatch(/หมด/);
  });

  it('จบงาน → ENDED + คืน Coin รางวัลที่เหลือให้ผู้จัด / Event ที่ไม่ได้ตรวจทันเวลาถูกปฏิเสธและคืนทั้งหมด', async () => {
    const { org, ev } = await publish({ rewardPerCheckIn: 5, rewardSlots: 10 });
    expect(await balanceOf(prisma, org.wallet.id)).toBe(40);
    const pending = (await org.agent.post('/events').send(base).expect(201)).body;
    expect(await balanceOf(prisma, org.wallet.id)).toBe(30);

    await prisma.event.update({ where: { id: ev.id }, data: { startsAt: new Date(Date.now() - 6 * 3_600_000), endsAt: new Date(Date.now() - 3 * 3_600_000) } });
    await prisma.event.update({ where: { id: pending.id }, data: { startsAt: new Date(Date.now() - 60_000) } });
    expect(await events.sweep()).toBe(2);
    expect(await events.sweep()).toBe(0);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: ev.id } })).status).toBe('ENDED');
    expect((await prisma.event.findUniqueOrThrow({ where: { id: pending.id } })).status).toBe('REJECTED');
    // ค่าโพสต์ของงานที่อนุมัติแล้วไม่คืน (10) ส่วนรางวัล 50 และงานที่ไม่ได้ตรวจ 10 คืน
    expect(await balanceOf(prisma, org.wallet.id)).toBe(90);
  });

  it('ไม่สนใจ → ซ่อนจากฟีด, แสดงใน "ของฉัน" เมื่อลงทะเบียน, ค้นหาและกรองตามประเภท', async () => {
    const { ev } = await publish();
    const { org } = await publish({ title: 'Hackathon วิศวะ', category: 'FACULTY', hostName: 'คณะวิศวกรรมศาสตร์' });
    const u = await makeUser(app);
    expect((await u.agent.get('/events').expect(200)).body).toHaveLength(2);
    expect((await u.agent.get('/events?filter=FACULTY').expect(200)).body).toHaveLength(1);
    expect((await u.agent.get('/events?q=hackathon').expect(200)).body).toHaveLength(1);

    await u.agent.post(`/events/${ev.id}/hide`).expect(200);
    expect((await u.agent.get('/events').expect(200)).body).toHaveLength(1);
    expect((await u.agent.get(`/events/${ev.id}`).expect(200)).body.hidden).toBe(true);
    await u.agent.post(`/events/${ev.id}/register`).expect(200);
    expect((await u.agent.get('/events').expect(200)).body).toHaveLength(2);
    expect((await u.agent.get('/events?filter=mine').expect(200)).body.map((e: { id: string }) => e.id)).toEqual([ev.id]);
    expect((await org.agent.get('/events?filter=mine').expect(200)).body).toHaveLength(1);
  });
});
