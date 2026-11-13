'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Bell, CalendarCheck, CalendarX, CheckCheck, ClipboardCheck, HandCoins, Hourglass, ShieldCheck, ShieldX } from 'lucide-react';
import type { NotificationItem, NotificationList, NotificationType } from '@tembo/shared';
import { api, post } from '@/lib/api';
import { announceUnread, AppShell } from '@/components/shell';
import { Button, Chip, cx, EmptyState, Spinner } from '@/components/ui';

const ICON: Record<NotificationType, [React.ReactNode, string]> = {
  EVENT_APPROVED: [<CalendarCheck key="i" />, 'bg-success-soft text-success'],
  EVENT_REJECTED: [<CalendarX key="i" />, 'bg-destructive-soft text-destructive'],
  EVENT_CANCELLED: [<Ban key="i" />, 'bg-destructive-soft text-destructive'],
  WAITLIST_PROMOTED: [<Hourglass key="i" />, 'bg-success-soft text-success'],
  SUBSIDY_APPROVED: [<ShieldCheck key="i" />, 'bg-coin-soft text-warning'],
  SUBSIDY_REJECTED: [<ShieldX key="i" />, 'bg-lavender-soft text-primary'],
  SURVEY_SPONSORED: [<HandCoins key="i" />, 'bg-coin-soft text-warning'],
  SURVEY_CLOSED: [<ClipboardCheck key="i" />, 'bg-lavender-soft text-primary'],
};

function ago(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'เมื่อสักครู่';
  if (s < 3600) return `${Math.floor(s / 60)} นาที`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} วัน`;
  return new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
}

export default function NotificationsPage() {
  return <AppShell><Notifications /></AppShell>;
}

/** Figma: NOTIFICATIONS / Center */
function Notifications() {
  const router = useRouter();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [data, setData] = useState<NotificationList | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(() => api<NotificationList>(`/notifications${unreadOnly ? '?unread=1' : ''}`).then((d) => { setData(d); announceUnread(d.unread); }), [unreadOnly]);
  useEffect(() => { setData(null); load().catch(() => setData({ items: [], unread: 0, nextBefore: null })); }, [load]);

  async function more() {
    if (!data?.nextBefore) return;
    setLoadingMore(true);
    try {
      const d = await api<NotificationList>(`/notifications?before=${encodeURIComponent(data.nextBefore)}${unreadOnly ? '&unread=1' : ''}`);
      setData({ ...d, items: [...data.items, ...d.items] });
    } finally { setLoadingMore(false); }
  }

  async function readAll() {
    const r = await post<{ unread: number }>('/notifications/read-all');
    announceUnread(r.unread);
    setData((d) => d && { ...d, unread: 0, items: unreadOnly ? [] : d.items.map((i) => ({ ...i, read: true })) });
  }

  async function open(n: NotificationItem) {
    if (!n.read) {
      const r = await post<{ unread: number }>(`/notifications/${n.id}/read`).catch(() => null);
      if (r) announceUnread(r.unread);
    }
    if (n.link) router.push(n.link);
    else setData((d) => d && { ...d, items: d.items.map((i) => (i.id === n.id ? { ...i, read: true } : i)) });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">แจ้งเตือน</h1>
          <p className="text-xs text-muted-foreground">{data ? (data.unread ? `ยังไม่อ่าน ${data.unread} รายการ` : 'อ่านครบแล้ว') : ' '}</p>
        </div>
        {!!data?.unread && <button type="button" onClick={readAll} className="flex items-center gap-1 text-xs font-bold text-primary"><CheckCheck className="size-4" />อ่านทั้งหมด</button>}
      </div>
      <div role="tablist" className="flex gap-2">
        <Chip active={!unreadOnly} onClick={() => setUnreadOnly(false)}>ทั้งหมด</Chip>
        <Chip active={unreadOnly} onClick={() => setUnreadOnly(true)}>ยังไม่อ่าน</Chip>
      </div>
      {!data ? <Spinner /> : data.items.length === 0 ? (
        <EmptyState icon={<Bell />} title={unreadOnly ? 'ไม่มีแจ้งเตือนที่ยังไม่อ่าน' : 'ยังไม่มีแจ้งเตือน'} text="เมื่อ Event ของคุณผ่านการตรวจ ได้ที่นั่งจากคิวรอ หรือแบบสอบถามปิดรับ จะแจ้งที่นี่" />
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-card shadow-card">
          {data.items.map((n) => {
            const [icon, cls] = ICON[n.type];
            return (
              <li key={n.id} className="border-b border-border last:border-0">
                <button type="button" onClick={() => open(n)} className={cx('flex w-full items-start gap-3 px-3.5 py-3 text-left hover:bg-lavender-soft/60', !n.read && 'bg-lavender-soft/40')}>
                  <span className={cx('flex size-8 shrink-0 items-center justify-center rounded-full [&_svg]:size-4', cls)}>{icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-extrabold">{n.title}{!n.read && <span className="size-2 rounded-full bg-primary" aria-label="ยังไม่อ่าน" />}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{ago(n.createdAt)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {data?.nextBefore && <Button variant="outline" className="w-full" disabled={loadingMore} onClick={more}>{loadingMore ? 'กำลังโหลด…' : 'ดูเพิ่ม'}</Button>}
    </div>
  );
}
