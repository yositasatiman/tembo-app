import {
  BadRequestException, Body, Controller, ForbiddenException, Get, HttpCode, Injectable, NotFoundException, Param, Patch, Post, Query, UseGuards,
} from '@nestjs/common';
import { Prisma, SYSTEM_WALLETS } from '@tembo/db';
import {
  AdminRedemptionItem, DecideRedemptionInput, decideRedemptionSchema, RedemptionItem, REWARD_RULES, RewardItem,
  rewardSchema, updateRewardSchema, bi } from '@tembo/shared';
import type { z } from 'zod';
import { AuthGuard, AuthUser, CurrentUser, Roles, RolesGuard } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { LedgerService, Tx } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications';
import { PrismaService } from '../prisma/prisma.service';

type RedemptionRow = Prisma.RewardRedemptionGetPayload<{ include: { reward: true } }>;

/**
 * ร้านรางวัล — Coin ได้จากกิจกรรมในแอปเท่านั้นและแลกเป็นของได้ แต่แลกกลับเป็นเงินไม่ได้
 * - แลก: Coin ผู้ใช้ → SYSTEM_BURN (ออกจากระบบ) + ลดสต็อก ในธุรกรรมเดียว
 * - ยกเลิก (ผู้ใช้ยกเลิกเองตอนรอรับของ หรือแอดมินยกเลิก): SYSTEM_BURN → ผู้ใช้ เต็มจำนวน + คืนสต็อก
 * - ส่งมอบ: เปลี่ยนสถานะอย่างเดียว ไม่มีการเคลื่อนไหวของ Coin
 */
@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string): Promise<RewardItem[]> {
    const rows = await this.prisma.reward.findMany({ where: { active: true }, orderBy: [{ cost: 'asc' }, { createdAt: 'desc' }] });
    const mine = await this.myCounts(userId, rows.map((r) => r.id));
    // ของที่หมดแล้วไว้ท้ายสุด
    return rows.sort((a, b) => Number(a.stock <= 0) - Number(b.stock <= 0)).map((r) => this.toItem(r, mine.get(r.id) ?? 0));
  }

  async myRedemptions(userId: string): Promise<RedemptionItem[]> {
    const rows = await this.prisma.rewardRedemption.findMany({ where: { userId }, include: { reward: true }, orderBy: { createdAt: 'desc' }, take: 100 });
    return rows.map((r) => this.toRedemption(r));
  }

  async redeem(userId: string, rewardId: string): Promise<RedemptionItem> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: { wallet: true } });
      if (REWARD_RULES.REQUIRE_CMU && !user.cmuVerifiedAt) throw new ForbiddenException(bi('Verify your @cmu.ac.th email before redeeming rewards', 'ยืนยันอีเมล @cmu.ac.th ก่อนแลกของรางวัล'));
      if (!user.wallet) throw new BadRequestException(bi('Coin wallet not found', 'ไม่พบกระเป๋าเหรียญ'));

      // ล็อกแถวของรางวัล: กันแลกพร้อมกันจนสต็อกหรือโควตาต่อคนเกิน
      const [reward] = await tx.$queryRaw<{ id: string; title: string; cost: number; stock: number; perUserLimit: number; active: boolean }[]>`
        SELECT id, title, cost, stock, "perUserLimit", active FROM "Reward" WHERE id = ${rewardId} FOR UPDATE`;
      if (!reward || !reward.active) throw new NotFoundException(bi('Reward not found', 'ไม่พบของรางวัลนี้'));
      if (reward.stock <= 0) throw new BadRequestException(bi('This reward is out of stock', 'ของรางวัลนี้หมดแล้ว'));
      const used = await tx.rewardRedemption.count({ where: { rewardId, userId, status: { not: 'CANCELLED' } } });
      if (used >= reward.perUserLimit) throw new BadRequestException(bi(`You can redeem this reward up to ${reward.perUserLimit} time(s)`, `แลกของรางวัลนี้ได้สูงสุด ${reward.perUserLimit} ครั้งต่อคน`));

      const red = await tx.rewardRedemption.create({ data: { rewardId, userId, cost: reward.cost }, include: { reward: true } });
      await this.ledger.post(tx, {
        type: 'REWARD_REDEEM', idempotencyKey: `reward:redeem:${red.id}`, memo: bi(`Redeemed ${reward.title}`, `แลก ${reward.title}`),
        entries: [{ walletId: user.wallet.id, delta: -reward.cost }, { walletId: SYSTEM_WALLETS.BURN, delta: reward.cost }],
      });
      await tx.reward.update({ where: { id: rewardId }, data: { stock: { decrement: 1 } } });
      return this.toRedemption(red);
    });
  }

  /** ผู้ใช้ยกเลิกเองได้เฉพาะตอนยังรอรับของ */
  async cancelByUser(userId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const red = await this.lockPending(tx, id);
      if (red.userId !== userId) throw new NotFoundException(bi('Item not found', 'ไม่พบรายการนี้'));
      return this.toRedemption(await this.cancel(tx, red, null, false));
    });
  }

  // ───────── แอดมิน ─────────

  async adminList(): Promise<(RewardItem & { pending: number; fulfilled: number })[]> {
    const rows = await this.prisma.reward.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] });
    const counts = await this.prisma.rewardRedemption.groupBy({ by: ['rewardId', 'status'], _count: true });
    const c = (id: string, s: string) => counts.find((x) => x.rewardId === id && x.status === s)?._count ?? 0;
    return rows.map((r) => ({ ...this.toItem(r, 0), pending: c(r.id, 'PENDING'), fulfilled: c(r.id, 'FULFILLED') }));
  }

  /** input ผ่าน ZodPipe(rewardSchema) มาแล้ว */
  async create(d: z.output<typeof rewardSchema>) {
    const r = await this.prisma.reward.create({ data: { ...d, imageUrl: d.imageUrl ?? null } });
    return this.toItem(r, 0);
  }

  async update(id: string, d: z.output<typeof updateRewardSchema>) {
    const r = await this.prisma.reward.update({ where: { id }, data: d }).catch((e) => {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') throw new NotFoundException(bi('Reward not found', 'ไม่พบของรางวัลนี้'));
      throw e;
    });
    return this.toItem(r, 0);
  }

  async adminRedemptions(status: 'PENDING' | 'ALL'): Promise<AdminRedemptionItem[]> {
    const rows = await this.prisma.rewardRedemption.findMany({
      where: status === 'PENDING' ? { status: 'PENDING' } : {},
      include: { reward: true, user: { select: { displayName: true, email: true, cmuEmail: true, faculty: true } } },
      orderBy: { createdAt: status === 'PENDING' ? 'asc' : 'desc' }, take: 200,
    });
    return rows.map((r) => ({ ...this.toRedemption(r), user: r.user }));
  }

  async decide(id: string, input: DecideRedemptionInput) {
    return this.prisma.$transaction(async (tx) => {
      const red = await this.lockPending(tx, id);
      const note = input.note?.trim() || null;
      if (input.action === 'CANCEL') return this.toRedemption(await this.cancel(tx, red, note, true));
      const done = await tx.rewardRedemption.update({ where: { id }, data: { status: 'FULFILLED', note, decidedAt: new Date() }, include: { reward: true } });
      await this.notifications.notify(tx, [red.userId], {
        type: 'REWARD_FULFILLED', title: bi(`“${red.reward.title}” has been handed over`, `ส่งมอบ “${red.reward.title}” แล้ว`), body: note ?? bi('An admin confirmed your reward was handed over', 'แอดมินยืนยันการส่งมอบของรางวัลแล้ว'), link: '/rewards?tab=mine',
      });
      return this.toRedemption(done);
    });
  }

  // ───────── ภายใน ─────────

  private async lockPending(tx: Tx, id: string) {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "RewardRedemption" WHERE id = ${id} FOR UPDATE`;
    if (!locked.length) throw new NotFoundException(bi('Item not found', 'ไม่พบรายการนี้'));
    const red = await tx.rewardRedemption.findUniqueOrThrow({ where: { id }, include: { reward: true, user: { include: { wallet: true } } } });
    if (red.status !== 'PENDING') throw new BadRequestException(bi('This item has already been processed', 'รายการนี้ดำเนินการไปแล้ว'));
    return red;
  }

  private async cancel(tx: Tx, red: Awaited<ReturnType<RewardsService['lockPending']>>, note: string | null, byAdmin: boolean) {
    await this.ledger.post(tx, {
      type: 'REWARD_REFUND', idempotencyKey: `reward:refund:${red.id}`, memo: bi(`Coin refund: ${red.reward.title}`, `คืนเหรียญ: ${red.reward.title}`),
      entries: [{ walletId: SYSTEM_WALLETS.BURN, delta: -red.cost }, { walletId: red.user.wallet!.id, delta: red.cost }],
    });
    await tx.reward.update({ where: { id: red.rewardId }, data: { stock: { increment: 1 } } });
    const done = await tx.rewardRedemption.update({ where: { id: red.id }, data: { status: 'CANCELLED', note, decidedAt: new Date() }, include: { reward: true } });
    if (byAdmin) {
      await this.notifications.notify(tx, [red.userId], {
        type: 'REWARD_CANCELLED', title: bi(`Redemption of “${red.reward.title}” cancelled`, `ยกเลิกการแลก “${red.reward.title}”`), body: bi(`${note ? `${note} · ` : ''}${red.cost} Coin refunded`, `${note ? `${note} · ` : ''}คืน ${red.cost} เหรียญแล้ว`), link: '/rewards?tab=mine',
      });
    }
    return done;
  }

  private async myCounts(userId: string, rewardIds: string[]) {
    if (!rewardIds.length) return new Map<string, number>();
    const g = await this.prisma.rewardRedemption.groupBy({
      by: ['rewardId'], where: { userId, rewardId: { in: rewardIds }, status: { not: 'CANCELLED' } }, _count: true,
    });
    return new Map(g.map((x) => [x.rewardId, x._count]));
  }

  private toItem(r: { id: string; title: string; description: string; imageUrl: string | null; cost: number; stock: number; perUserLimit: number; active: boolean }, redeemedByMe: number): RewardItem {
    return { id: r.id, title: r.title, description: r.description, imageUrl: r.imageUrl, cost: r.cost, stock: r.stock, perUserLimit: r.perUserLimit, active: r.active, redeemedByMe };
  }

  private toRedemption(r: RedemptionRow): RedemptionItem {
    return {
      id: r.id, status: r.status, cost: r.cost, note: r.note, createdAt: r.createdAt.toISOString(), decidedAt: r.decidedAt?.toISOString() ?? null,
      reward: { id: r.reward.id, title: r.reward.title, imageUrl: r.reward.imageUrl },
    };
  }
}

@Controller('rewards')
@UseGuards(AuthGuard)
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) { return this.rewards.list(u.id); }

  @Get('mine')
  mine(@CurrentUser() u: AuthUser) { return this.rewards.myRedemptions(u.id); }

  @Post(':id/redeem')
  @HttpCode(200)
  redeem(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.rewards.redeem(u.id, id); }

  @Post('redemptions/:id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.rewards.cancelByUser(u.id, id); }
}

@Controller('admin/rewards')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminRewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get()
  list() { return this.rewards.adminList(); }

  @Post()
  create(@Body(new ZodPipe(rewardSchema)) body: z.output<typeof rewardSchema>) { return this.rewards.create(body); }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodPipe(updateRewardSchema)) body: z.output<typeof updateRewardSchema>) { return this.rewards.update(id, body); }

  @Get('redemptions')
  redemptions(@Query('status') status?: string) { return this.rewards.adminRedemptions(status === 'ALL' ? 'ALL' : 'PENDING'); }

  @Post('redemptions/:id')
  @HttpCode(200)
  decide(@Param('id') id: string, @Body(new ZodPipe(decideRedemptionSchema)) body: DecideRedemptionInput) { return this.rewards.decide(id, body); }
}
