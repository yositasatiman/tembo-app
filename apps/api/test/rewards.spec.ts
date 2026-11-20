import { INestApplication } from '@nestjs/common';
import { SYSTEM_WALLETS } from '@tembo/db';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertLedgerInvariant, balanceOf, createTestApp, makeUser, resetDb } from './helpers';

const reward = (o: Record<string, unknown> = {}) => ({ title: 'คูปองกาแฟ', description: 'รับที่ห้อง CPE 101', cost: 30, stock: 2, ...o });

describe('ร้านรางวัล', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  beforeAll(async () => { ({ app, prisma } = await createTestApp()); });
  beforeEach(async () => resetDb(prisma));
  afterAll(async () => app.close());

  it('แลก → Coin ออกจากระบบ + ลดสต็อก, ส่งมอบ → แจ้งเตือน', async () => {
    const admin = await makeUser(app, { role: 'ADMIN', balance: 0 });
    const u = await makeUser(app, { balance: 100 });
    const r = (await admin.agent.post('/admin/rewards').send(reward()).expect(201)).body;
    expect(r).toMatchObject({ perUserLimit: 1, active: true, stock: 2 });

    const red = (await u.agent.post(`/rewards/${r.id}/redeem`).expect(200)).body;
    expect(red).toMatchObject({ status: 'PENDING', cost: 30 });
    expect(await balanceOf(prisma, u.wallet.id)).toBe(70);
    expect(await balanceOf(prisma, SYSTEM_WALLETS.BURN)).toBe(30);
    expect((await u.agent.get('/rewards').expect(200)).body[0]).toMatchObject({ stock: 1, redeemedByMe: 1 });

    // โควตา 1 ครั้งต่อคน
    await u.agent.post(`/rewards/${r.id}/redeem`).expect(400);

    await admin.agent.post(`/admin/rewards/redemptions/${red.id}`).send({ action: 'FULFILL', note: 'รับแล้วที่ห้อง 101' }).expect(200);
    expect((await u.agent.get('/rewards/mine').expect(200)).body[0]).toMatchObject({ status: 'FULFILLED', note: 'รับแล้วที่ห้อง 101' });
    expect((await u.agent.get('/notifications').expect(200)).body.items[0].type).toBe('REWARD_FULFILLED');
    // ส่งมอบแล้วยกเลิกไม่ได้
    await u.agent.post(`/rewards/redemptions/${red.id}/cancel`).expect(400);
    await assertLedgerInvariant(prisma);
  });

  it('ยกเลิก (ผู้ใช้เอง / แอดมิน) → คืน Coin เต็มจำนวน + คืนสต็อก', async () => {
    const admin = await makeUser(app, { role: 'ADMIN', balance: 0 });
    const u = await makeUser(app, { balance: 100 });
    const other = await makeUser(app, { balance: 100 });
    const r = (await admin.agent.post('/admin/rewards').send(reward({ perUserLimit: 2 })).expect(201)).body;

    const a = (await u.agent.post(`/rewards/${r.id}/redeem`).expect(200)).body;
    await other.agent.post(`/rewards/redemptions/${a.id}/cancel`).expect(404); // ของคนอื่น
    await u.agent.post(`/rewards/redemptions/${a.id}/cancel`).expect(200);
    expect(await balanceOf(prisma, u.wallet.id)).toBe(100);

    const b = (await u.agent.post(`/rewards/${r.id}/redeem`).expect(200)).body;
    await admin.agent.post(`/admin/rewards/redemptions/${b.id}`).send({ action: 'CANCEL' }).expect(400); // ต้องมีเหตุผล
    await admin.agent.post(`/admin/rewards/redemptions/${b.id}`).send({ action: 'CANCEL', note: 'ของหมดจริง' }).expect(200);
    expect(await balanceOf(prisma, u.wallet.id)).toBe(100);
    expect((await u.agent.get('/notifications').expect(200)).body.items[0]).toMatchObject({ type: 'REWARD_CANCELLED' });
    expect((await admin.agent.get('/admin/rewards').expect(200)).body[0]).toMatchObject({ stock: 2, pending: 0 });
    await assertLedgerInvariant(prisma);
  });

  it('เงื่อนไข: Coin ไม่พอ / ยังไม่ยืนยัน มช. / ของหมด / ปิดการแลก / ผู้ใช้ทั่วไปจัดการไม่ได้', async () => {
    const admin = await makeUser(app, { role: 'ADMIN', balance: 0 });
    const poor = await makeUser(app, { balance: 10 });
    const notCmu = await makeUser(app, { cmu: false, balance: 100 });
    const [a, b] = await Promise.all([makeUser(app), makeUser(app)]);
    const r = (await admin.agent.post('/admin/rewards').send(reward({ stock: 1 })).expect(201)).body;

    await poor.agent.post(`/rewards/${r.id}/redeem`).expect(400);
    await notCmu.agent.post(`/rewards/${r.id}/redeem`).expect(403);
    await a.agent.post('/admin/rewards').send(reward()).expect(403);

    // แลกพร้อมกัน 2 คน สต็อก 1 → สำเร็จคนเดียว
    const res = await Promise.all([a.agent.post(`/rewards/${r.id}/redeem`), b.agent.post(`/rewards/${r.id}/redeem`)]);
    expect(res.map((x) => x.status).sort()).toEqual([200, 400]);

    await admin.agent.patch(`/admin/rewards/${r.id}`).send({ stock: 5, active: false }).expect(200);
    const after = (await admin.agent.get('/admin/rewards').expect(200)).body[0];
    expect(after).toMatchObject({ stock: 5, active: false, perUserLimit: 1, cost: 30 }); // แก้บางช่องไม่ทับช่องอื่น
    expect((await a.agent.get('/rewards').expect(200)).body).toHaveLength(0);
    await poor.agent.post(`/rewards/${r.id}/redeem`).expect(404);
    await assertLedgerInvariant(prisma);
  });
});
