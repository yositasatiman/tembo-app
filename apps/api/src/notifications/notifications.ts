import { Controller, Get, HttpCode, Injectable, Param, Post, Query, UseGuards } from '@nestjs/common';
import { NotificationType } from '@tembo/db';
import type { NotificationList } from '@tembo/shared';
import { AuthGuard, AuthUser, CurrentUser } from '../common/auth';
import type { Tx } from '../ledger/ledger.service';
import { PrismaService } from '../prisma/prisma.service';

export interface NotifyInput { type: NotificationType; title: string; body: string; link?: string }

/** แจ้งเตือนในแอป — สร้างในธุรกรรมเดียวกับเหตุการณ์ (ถ้าเหตุการณ์ rollback แจ้งเตือนก็ไม่เกิด) */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(db: Tx | PrismaService, userIds: string[], n: NotifyInput) {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    await db.notification.createMany({ data: ids.map((userId) => ({ userId, type: n.type, title: n.title, body: n.body, link: n.link ?? null })) });
  }

  async list(userId: string, opts: { unreadOnly?: boolean; before?: Date; limit?: number } = {}): Promise<NotificationList> {
    const take = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    const rows = await this.prisma.notification.findMany({
      where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}), ...(opts.before ? { createdAt: { lt: opts.before } } : {}) },
      orderBy: { createdAt: 'desc' }, take: take + 1,
    });
    const page = rows.slice(0, take);
    return {
      items: page.map((r) => ({ id: r.id, type: r.type, title: r.title, body: r.body, link: r.link, read: !!r.readAt, createdAt: r.createdAt.toISOString() })),
      unread: await this.unreadCount(userId),
      nextBefore: rows.length > take ? page[page.length - 1].createdAt.toISOString() : null,
    };
  }

  unreadCount(userId: string) { return this.prisma.notification.count({ where: { userId, readAt: null } }); }

  async markRead(userId: string, id?: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
    return { unread: await this.unreadCount(userId) };
  }
}

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly n: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('unread') unread?: string, @Query('before') before?: string) {
    const b = before ? new Date(before) : undefined;
    return this.n.list(u.id, { unreadOnly: unread === '1', before: b && !Number.isNaN(b.getTime()) ? b : undefined });
  }

  @Get('unread-count')
  async count(@CurrentUser() u: AuthUser) { return { unread: await this.n.unreadCount(u.id) }; }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() u: AuthUser) { return this.n.markRead(u.id); }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentUser() u: AuthUser, @Param('id') id: string) { return this.n.markRead(u.id, id); }
}
