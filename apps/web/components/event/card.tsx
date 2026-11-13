'use client';
import Link from 'next/link';
import { CalendarDays, Coins, MapPin, Share2, Sparkles, Users } from 'lucide-react';
import type { EventSummary } from '@tembo/shared';
import { cx } from '../ui';
import { EventCover } from './cover';
import { eventState, eventTimeShort, shareLink } from './util';

/** การ์ด Event ตาม Figma "EVENT / Browse" */
export function EventCard({ e, onHide, onToast, reason }: { e: EventSummary; onHide?: (id: string) => void; onToast?: (msg: string) => void; reason?: string }) {
  const state = eventState(e);
  const href = `/events/${e.id}`;
  const going = e.capacity !== null && e.isFull ? 'เต็มแล้ว' : `${e.registeredCount.toLocaleString()} คนเข้าร่วม${e.capacity ? ` / ${e.capacity.toLocaleString()}` : ''}`;
  const action = {
    open: 'เข้าร่วม', full: 'เข้าคิวรอ', registered: 'ลงทะเบียนแล้ว', waitlisted: 'อยู่ในคิวรอ',
    pending: 'รอแอดมินตรวจ', rejected: 'ไม่ผ่านการตรวจ', cancelled: 'ยกเลิกแล้ว', ended: 'จบแล้ว',
  }[state];
  const primary = state === 'open' || state === 'full';
  return (
    <article className="overflow-hidden rounded-2xl bg-card shadow-card">
      <Link href={href} aria-label={e.title}><EventCover e={e} className="h-[82px]" /></Link>
      <div className="space-y-1.5 px-3 pt-2.5 pb-3">
        <p className="flex items-center gap-2 text-[11px] font-extrabold tracking-wide text-primary">
          EVENT{reason && <span className="flex items-center gap-1 font-bold text-success"><Sparkles className="size-3.5" />{reason}</span>}
        </p>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm leading-tight font-extrabold"><Link href={href} className="hover:text-primary">{e.title}</Link></h3>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">โดย {e.hostName}</p>
          </div>
          <button type="button" aria-label="แชร์" onClick={async () => { const m = await shareLink(e.title, href); if (m) onToast?.(m); }}
            className="flex size-[30px] shrink-0 items-center justify-center rounded-[10px] bg-lavender-soft text-primary hover:bg-lavender">
            <Share2 className="size-[15px]" />
          </button>
        </div>
        <p className="flex items-center gap-1.5 text-[11px] font-bold"><CalendarDays className="size-3.5 text-primary" />{eventTimeShort(e.startsAt, e.endsAt)}</p>
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><MapPin className="size-3.5 shrink-0 text-primary" /><span className="truncate">{e.location}</span></p>
        {(e.tags.length > 0 || e.rewardPerCheckIn > 0) && (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {e.rewardPerCheckIn > 0 && e.rewardsLeft > 0 && (
              <span className="flex items-center gap-1 rounded-full bg-coin-soft px-2 py-1 text-[11px] font-bold text-indigo"><Coins className="size-3" />+{e.rewardPerCheckIn} Coin</span>
            )}
            {e.tags.slice(0, 3).map((t) => <span key={t} className="rounded-full bg-lavender-soft px-2 py-1 text-[11px] font-bold text-primary">{t}</span>)}
          </div>
        )}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground"><Users className="size-3.5" />{going}</span>
          <div className="flex items-center gap-1.5">
            {onHide && (state === 'open' || state === 'full') && (
              <button type="button" onClick={() => onHide(e.id)} className="h-8 px-2 text-[11px] font-bold text-muted-foreground hover:text-indigo">ไม่สนใจ</button>
            )}
            <Link href={href} className={cx('flex h-[34px] items-center rounded-[10px] px-4 text-xs font-bold',
              primary ? 'bg-primary text-white hover:bg-primary/90'
                : state === 'registered' ? 'bg-success-soft text-success'
                  : 'bg-lavender-soft text-primary')}>
              {action}
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}
