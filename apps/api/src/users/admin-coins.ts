import { Body, Controller, HttpCode, Injectable, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { SYSTEM_WALLETS } from '@tembo/db';
import { GrantCoinInput, grantCoinSchema } from '@tembo/shared';
import { AuthGuard, AuthUser, CurrentUser, Roles, RolesGuard } from '../common/auth';
import { ZodPipe } from '../common/zod.pipe';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';

/** แอดมินเพิ่ม Coin ให้บัญชี (ใช้ทดสอบ) — สร้าง Coin ใหม่จาก SYSTEM_MINT และบันทึกใน ledger ว่าแอดมินคนไหนเพิ่ม */
@Injectable()
export class AdminCoinsService {
  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}

  async grant(adminId: string, input: GrantCoinInput) {
    const user = await this.prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { cmuEmail: input.email }] }, include: { wallet: true },
    });
    if (!user?.wallet) throw new NotFoundException('ไม่พบบัญชีที่ใช้อีเมลนี้ (ต้องล็อกอินอย่างน้อย 1 ครั้ง)');
    const admin = await this.prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    await this.prisma.$transaction((tx) => this.ledger.post(tx, {
      type: 'ADMIN_ADJUST', idempotencyKey: `admin-grant:${randomUUID()}`,
      memo: `${input.memo} (โดย ${admin.displayName ?? admin.email})`,
      entries: [{ walletId: SYSTEM_WALLETS.MINT, delta: -input.amount }, { walletId: user.wallet!.id, delta: input.amount }],
    }));
    const w = await this.prisma.wallet.findUniqueOrThrow({ where: { id: user.wallet.id } });
    return { displayName: user.displayName, email: user.cmuEmail ?? user.email, balance: w.balance };
  }
}

@Controller('admin/coins')
@UseGuards(AuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminCoinsController {
  constructor(private readonly coins: AdminCoinsService) {}

  @Post('grant')
  @HttpCode(200)
  grant(@CurrentUser() u: AuthUser, @Body(new ZodPipe(grantCoinSchema)) body: GrantCoinInput) { return this.coins.grant(u.id, body); }
}
