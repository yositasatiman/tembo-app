'use client';
import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { ArrowLeft, CheckCircle2, Hourglass, RefreshCw } from 'lucide-react';
import { facultyLabel, type CheckInCodeResponse, type EventAttendee, type EventDetail } from '@tembo/shared';
import { useT } from '@/lib/i18n';
import { api } from '@/lib/api';
import { AppShell } from '@/components/shell';
import { Badge, ErrorText, fmtDate, Spinner } from '@/components/ui';
import { eventTimeShort, timeOnly } from '@/components/event/util';

export default function ManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AppShell><Manage id={id} /></AppShell>;
}

/** หน้าผู้จัด: QR เช็กอินที่เปลี่ยนทุกนาที + รายชื่อผู้ลงทะเบียน */
function Manage({ id }: { id: string }) {
  const { t, p: pick, lang } = useT();
  const fac = (f: string | null) => (f ? pick(facultyLabel(f)) : '');
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [people, setPeople] = useState<EventAttendee[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [e, p] = await Promise.all([api<EventDetail>(`/events/${id}`), api<EventAttendee[]>(`/events/${id}/attendees`)]);
      setEvent(e); setPeople(p);
    } catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); const h = setInterval(load, 15_000); return () => clearInterval(h); }, [load]);

  if (!event) return error ? <div className="mx-auto max-w-2xl"><ErrorText>{error}</ErrorText></div> : <Spinner />;
  const registered = people.filter((p) => p.status === 'REGISTERED');
  const waitlist = people.filter((p) => p.status === 'WAITLISTED');

  return (
    <div className="mx-auto max-w-2xl space-y-3">
      <Link href={`/events/${id}`} className="flex items-center gap-1 text-sm font-bold text-muted-foreground hover:text-indigo"><ArrowLeft className="size-4" />{t('Back to event', 'กลับไปที่กิจกรรม')}</Link>
      <div>
        <h1 className="text-[22px] font-extrabold">{event.title}</h1>
        <p className="text-xs text-muted-foreground">{eventTimeShort(event.startsAt, event.endsAt, lang)} · {event.location}</p>
      </div>

      {event.status === 'PUBLISHED' && <CheckInQr event={event} />}

      <section className="rounded-2xl bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-extrabold">{t('Registered', 'ผู้ลงทะเบียน')} ({registered.length}{event.capacity ? `/${event.capacity}` : ''})</h2>
          <Badge tone="success"><CheckCircle2 />{t('Checked in', 'เช็กอิน')} {event.checkedInCount}</Badge>
        </div>
        {registered.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{t('No one has registered yet', 'ยังไม่มีผู้ลงทะเบียน')}</p> : (
          <ul className="divide-y divide-border">
            {registered.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0"><span className="font-bold">{p.name ?? t('No name', 'ไม่ระบุชื่อ')}</span><span className="block truncate text-xs text-muted-foreground">{fac(p.faculty)} · {t('registered', 'ลงทะเบียน')} {fmtDate(p.registeredAt)}</span></span>
                {p.checkedInAt ? <Badge tone="success">{t('Checked in', 'เช็กอิน')} {timeOnly(p.checkedInAt)}</Badge> : <Badge tone="muted">{t('Not here yet', 'ยังไม่มา')}</Badge>}
              </li>
            ))}
          </ul>
        )}
        {waitlist.length > 0 && (
          <>
            <h3 className="mt-4 mb-1 flex items-center gap-1 text-sm font-extrabold"><Hourglass className="size-4" />{t('Waitlist', 'คิวรอ')} ({waitlist.length})</h3>
            <ol className="list-decimal pl-5 text-sm text-muted-foreground">{waitlist.map((p, i) => <li key={i}>{p.name ?? t('No name', 'ไม่ระบุชื่อ')} · {fac(p.faculty)}</li>)}</ol>
          </>
        )}
      </section>
    </div>
  );
}

function CheckInQr({ event }: { event: EventDetail }) {
  const { t } = useT();
  const [data, setData] = useState<CheckInCodeResponse | null>(null);
  const [qr, setQr] = useState('');
  const [error, setError] = useState('');
  const [left, setLeft] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const d = await api<CheckInCodeResponse>(`/events/${event.id}/checkin-code`);
      // ใช้ origin ของหน้าเว็บที่เปิดอยู่ เผื่อเซิร์ฟเวอร์ตั้ง WEB_ORIGIN ไม่ตรง
      const url = `${window.location.origin}/events/${event.id}/checkin?code=${d.code}`;
      setData(d); setLeft(d.expiresInSec); setError('');
      setQr(await QRCode.toDataURL(url, { width: 480, margin: 1, color: { dark: '#20105c', light: '#ffffff' } }));
    } catch (e) { setError((e as Error).message); setData(null); }
  }, [event.id]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!data) return;
    const h = setInterval(() => setLeft((s) => { if (s <= 1) { refresh(); return 0; } return s - 1; }), 1000);
    return () => clearInterval(h);
  }, [data, refresh]);

  if (!data) {
    return (
      <section className="rounded-2xl bg-card p-4 text-center shadow-card">
        <p className="font-extrabold">{t('Check-in QR', 'QR เช็กอิน')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{error || t('Loading…', 'กำลังโหลด…')}</p>
        {!event.checkInOpen && <p className="mt-1 text-xs text-muted-foreground">{t('Check-in opens', 'เปิดเช็กอินได้')} {timeOnly(event.checkInOpensAt)}–{timeOnly(event.checkInClosesAt)}{t('', ' น.')}</p>}
        <button type="button" onClick={refresh} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary"><RefreshCw className="size-4" />{t('Try again', 'ลองอีกครั้ง')}</button>
      </section>
    );
  }
  return (
    <section className="rounded-2xl bg-card p-5 text-center shadow-card">
      <p className="font-extrabold">{t('Ask attendees to scan this QR with their phone camera', 'ให้ผู้เข้าร่วมสแกน QR นี้ด้วยกล้องมือถือ')}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {qr && <img src={qr} alt={t(`Check-in QR, code ${data.code}`, `QR เช็กอิน รหัส ${data.code}`)} className="mx-auto my-3 size-64 rounded-xl" />}
      <p className="font-mono text-3xl font-extrabold tracking-[0.35em]">{data.code}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t(`Code changes in ${left}s · or type it on the event check-in page`, `รหัสเปลี่ยนใน ${left} วินาที · หรือพิมพ์รหัสที่หน้าเช็กอินของกิจกรรม`)}</p>
    </section>
  );
}
