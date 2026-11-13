import { Controller, Get, Injectable, Query, UseGuards } from '@nestjs/common';
import { FEED_TABS, FeedItem, FeedTab, scoreFeedItem } from '@tembo/shared';
import { AuthGuard, AuthUser, CurrentUser } from '../common/auth';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { SurveysService } from '../surveys/surveys.service';

/**
 * ฟีดรวมแบบสอบถาม + Event
 * - all: ใหม่สุดก่อน (ไม่รวมของตัวเองและที่ทำไปแล้ว)
 * - foryou: เฉพาะที่ตรงความสนใจ/คณะ เรียงตามคะแนน scoreFeedItem — ถ้าไม่มีเลยใช้ทั้งหมดเรียงตามคะแนน
 */
@Injectable()
export class FeedService {
  constructor(private readonly prisma: PrismaService, private readonly surveys: SurveysService, private readonly events: EventsService) {}

  async feed(viewerId: string, tab: FeedTab): Promise<FeedItem[]> {
    const [user, surveys, events] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: viewerId }, select: { interests: true, faculty: true } }),
      this.surveys.list(viewerId, 100),
      this.events.list(viewerId, 'all'),
    ]);
    const now = Date.now();
    const items: (FeedItem & { relevant: boolean; at: string })[] = [
      ...surveys.filter((s) => !s.isMine && !s.responded && s.payableResponses > 0).map((survey) => {
        const sc = scoreFeedItem({ kind: 'survey', survey }, user, now);
        return { kind: 'survey' as const, id: survey.id, score: sc.score, reasons: sc.reasons, relevant: sc.relevant, at: survey.createdAt, survey };
      }),
      ...events.filter((e) => !e.isOrganizer).map((event) => {
        const sc = scoreFeedItem({ kind: 'event', event }, user, now);
        return { kind: 'event' as const, id: event.id, score: sc.score, reasons: sc.reasons, relevant: sc.relevant, at: event.createdAt, event };
      }),
    ];
    let out = items;
    if (tab === 'foryou') {
      const relevant = items.filter((i) => i.relevant);
      out = (relevant.length ? relevant : items).sort((a, b) => b.score - a.score || b.at.localeCompare(a.at));
    } else {
      out = items.sort((a, b) => b.at.localeCompare(a.at));
    }
    return out.slice(0, 60).map(({ relevant: _r, at: _a, ...rest }) => rest as FeedItem);
  }
}

@Controller('feed')
@UseGuards(AuthGuard)
export class FeedController {
  constructor(private readonly feed: FeedService) {}

  @Get()
  get(@CurrentUser() u: AuthUser, @Query('tab') tab?: string) {
    return this.feed.feed(u.id, (FEED_TABS as readonly string[]).includes(tab ?? '') ? (tab as FeedTab) : 'all');
  }
}
