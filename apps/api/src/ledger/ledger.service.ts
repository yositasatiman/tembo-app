import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, TxType } from '@tembo/db';

export type Tx = Prisma.TransactionClient;
export interface EntryInput { walletId: string; delta: number }
export interface PostInput { type: TxType; idempotencyKey: string; memo?: string; entries: EntryInput[] }

export class InsufficientCoinError extends BadRequestException {
  constructor() { super('Coin ไม่พอ'); }
}

/**
 * บัญชีแยกประเภทแบบ double-entry
 * - ทุกธุรกรรมต้องมี entry อย่างน้อย 2 รายการและผลรวม delta = 0
 * - ล็อกแถวกระเป๋า (SELECT ... FOR UPDATE) ตามลำดับ id เพื่อกัน race condition และ deadlock
 * - กระเป๋าทุกประเภทห้ามติดลบ ยกเว้น SYSTEM_MINT (ต้นทางของ Coin ใหม่)
 * - idempotencyKey ซ้ำ = คืนธุรกรรมเดิม ไม่ประมวลผลซ้ำ
 * ต้องเรียกภายใน prisma.$transaction เสมอ
 */
@Injectable()
export class LedgerService {
  async post(tx: Tx, input: PostInput) {
    const { entries } = input;
    if (entries.length < 2) throw new Error('Ledger tx needs >= 2 entries');
    if (entries.some((e) => !Number.isInteger(e.delta) || e.delta === 0)) throw new Error('delta must be non-zero integer');
    if (entries.reduce((s, e) => s + e.delta, 0) !== 0) throw new Error('Ledger tx must sum to zero');

    const existing = await tx.ledgerTx.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return { tx: existing, duplicated: true as const };

    const ids = [...new Set(entries.map((e) => e.walletId))].sort();
    const rows = await tx.$queryRaw<{ id: string; kind: string; balance: number }[]>`
      SELECT id, kind::text AS kind, balance FROM "Wallet"
      WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
    if (rows.length !== ids.length) throw new Error('Wallet not found');

    const next = new Map(rows.map((r) => [r.id, { kind: r.kind, balance: r.balance }]));
    for (const e of entries) next.get(e.walletId)!.balance += e.delta;
    for (const [, w] of next) if (w.kind !== 'SYSTEM_MINT' && w.balance < 0) throw new InsufficientCoinError();

    const created = await tx.ledgerTx.create({
      data: { type: input.type, idempotencyKey: input.idempotencyKey, memo: input.memo, entries: { create: entries } },
    });
    for (const [id, w] of next) await tx.wallet.update({ where: { id }, data: { balance: w.balance } });
    return { tx: created, duplicated: false as const };
  }
}
