import { INestApplication } from '@nestjs/common';
import { SYSTEM_WALLETS } from '@tembo/db';
import { LedgerService } from '../src/ledger/ledger.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, FakeMail, login, resetDb } from './helpers';

describe('Ledger', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: FakeMail;
  let ledger: LedgerService;

  beforeAll(async () => {
    ({ app, prisma, mail } = await createTestApp());
    ledger = app.get(LedgerService);
  });
  beforeEach(async () => resetDb(prisma));
  afterAll(async () => app.close());

  const userWallet = async (email: string) => {
    await login(app, prisma, mail, email);
    return prisma.wallet.findFirstOrThrow({ where: { user: { email } } });
  };

  it('ปฏิเสธธุรกรรมที่ผลรวมไม่เป็นศูนย์', async () => {
    const w = await userWallet('a@gmail.com');
    await expect(prisma.$transaction((tx) => ledger.post(tx, {
      type: 'ADMIN_ADJUST', idempotencyKey: 'bad',
      entries: [{ walletId: w.id, delta: -10 }, { walletId: SYSTEM_WALLETS.BURN, delta: 5 }],
    }))).rejects.toThrow(/sum to zero/);
  });

  it('idempotencyKey เดิมไม่ประมวลผลซ้ำ', async () => {
    const w = await userWallet('a@gmail.com');
    const run = () => prisma.$transaction((tx) => ledger.post(tx, {
      type: 'ADMIN_ADJUST', idempotencyKey: 'same-key',
      entries: [{ walletId: w.id, delta: -10 }, { walletId: SYSTEM_WALLETS.BURN, delta: 10 }],
    }));
    await run();
    const second = await run();
    expect(second.duplicated).toBe(true);
    expect((await prisma.wallet.findUniqueOrThrow({ where: { id: w.id } })).balance).toBe(90);
  });

  it('หักพร้อมกัน 30 คำขอ คำขอละ 10 จากยอด 100: สำเร็จ 10 ครั้งพอดี ไม่ติดลบ', async () => {
    const w = await userWallet('a@gmail.com');
    const results = await Promise.allSettled(Array.from({ length: 30 }, (_, i) =>
      prisma.$transaction((tx) => ledger.post(tx, {
        type: 'ADMIN_ADJUST', idempotencyKey: `debit-${i}`,
        entries: [{ walletId: w.id, delta: -10 }, { walletId: SYSTEM_WALLETS.BURN, delta: 10 }],
      }), { timeout: 20_000, maxWait: 20_000 })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(10);
    const after = await prisma.wallet.findUniqueOrThrow({ where: { id: w.id } });
    expect(after.balance).toBe(0);

    // invariant: ยอดของทุกกระเป๋า = ผลรวม entry และผลรวมทั้งระบบ = 0
    const wallets = await prisma.wallet.findMany();
    for (const wl of wallets) {
      const sum = await prisma.ledgerEntry.aggregate({ where: { walletId: wl.id }, _sum: { delta: true } });
      expect(sum._sum.delta ?? 0).toBe(wl.balance);
    }
    expect(wallets.reduce((s, x) => s + x.balance, 0)).toBe(0);
  });
});
