'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays } from 'lucide-react';
import { EVENT_CATEGORY_LABEL, EVENT_FILTERS, type EventFilter, type EventSummary } from '@tembo/shared';
import { api, post } from '@/lib/api';
import { AppShell, FeedTabs, PageHeading } from '@/components/shell';
import { EventCard } from '@/components/event/card';
import { Chip, EmptyState, Spinner, Toast } from '@/components/ui';

const FILTER_LABEL: Record<EventFilter, string> = { all: 'ทั้งหมด', ...EVENT_CATEGORY_LABEL, mine: 'Event ของฉัน' };

export default function EventsPage() {
  return <AppShell><Suspense fallback={<Spinner />}><Browse /></Suspense></AppShell>;
}

/** ตาม Figma "EVENT / Browse" */
function Browse() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get('filter') ?? 'all';
  const filter: EventFilter = (EVENT_FILTERS as readonly string[]).includes(raw) ? (raw as EventFilter) : 'all';
  const q = params.get('q') ?? '';
  const [rows, setRows] = useState<EventSummary[] | null>(null);
  const [toast, setToast] = useState<{ msg: string; undo?: () => void } | null>(null);

  const load = useCallback(() => {
    const qs = new URLSearchParams({ filter, ...(q ? { q } : {}) });
    return api<EventSummary[]>(`/events?${qs}`).then(setRows).catch(() => setRows([]));
  }, [filter, q]);
  useEffect(() => { setRows(null); load(); }, [load]);

  function setFilter(f: EventFilter) {
    const next = new URLSearchParams(params);
    if (f === 'all') next.delete('filter'); else next.set('filter', f);
    router.replace(`/events${next.size ? `?${next}` : ''}`);
  }

  async function hide(id: string) {
    setRows((r) => r?.filter((e) => e.id !== id) ?? r);
    try {
      await post(`/events/${id}/hide`);
      setToast({ msg: 'ซ่อน Event นี้แล้ว', undo: async () => { await api(`/events/${id}/hide`, { method: 'DELETE' }); setToast(null); load(); } });
    } catch (e) { setToast({ msg: (e as Error).message }); load(); }
  }

  return (
    <div className="space-y-3">
      <PageHeading title={q ? `ค้นหา “${q}”` : 'ค้นพบ Event'} subtitle="พบเพื่อนใหม่ เรียนรู้ และออกไปสำรวจรอบ มช." create={{ href: '/events/new', label: 'สร้าง' }} />
      <FeedTabs active="event" />

      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5" role="tablist" aria-label="ประเภท Event">
        {EVENT_FILTERS.map((f) => <Chip key={f} active={filter === f} onClick={() => setFilter(f)}>{FILTER_LABEL[f]}</Chip>)}
      </div>

      {rows === null ? <Spinner />
        : rows.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title={filter === 'mine' ? 'ยังไม่มี Event ของคุณ' : 'ยังไม่มี Event ที่เปิดรับ'}
            text={filter === 'mine' ? 'Event ที่คุณลงทะเบียนหรือเป็นผู้จัดจะแสดงที่นี่' : q ? 'ลองค้นหาด้วยคำอื่น' : 'เป็นคนแรกที่ชวนเพื่อน ๆ มาร่วมงาน'}
            action={<Link href="/events/new" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">สร้าง Event</Link>} />
        ) : (
          <div className="space-y-2.5">
            {rows.map((e) => <EventCard key={e.id} e={e} onHide={filter === 'mine' ? undefined : hide} onToast={(msg) => setToast({ msg })} />)}
          </div>
        )}
      {toast && <Toast onClose={() => setToast(null)} action={toast.undo ? { label: 'เลิกทำ', onClick: toast.undo } : undefined}>{toast.msg}</Toast>}
    </div>
  );
}
