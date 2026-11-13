'use client';
import { use, useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck, Ban, CalendarDays, CalendarPlus, CheckCircle2, Clock, Coins, ExternalLink, Hourglass,
  MapPin, QrCode, Settings2, Share2, Ticket, XCircle,
} from 'lucide-react';
import { EVENT_CATEGORY_LABEL, type EventDetail } from '@tembo/shared';
import { api, post } from '@/lib/api';
import { AppShell, useMe } from '@/components/shell';
import { Banner, cx, ErrorText, Spinner, Toast } from '@/components/ui';
import { EventCover } from '@/components/event/cover';
import { downloadIcs, eventState, eventTimeLong, hostMark, shareLink, timeOnly } from '@/components/event/util';

export default function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AppShell><Detail id={id} /></AppShell>;
}

/** ตาม Figma "EVENT / Detail", "EVENT / Registered", "EVENT / Cancelled" */
function Detail({ id }: { id: string }) {
  const { reload: reloadMe } = useMe();
  const router = useRouter();
  const [e, setE] = useState<EventDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(() => api<EventDetail>(`/events/${id}`).then(setE).catch((err) => setError((err as Error).message)), [id]);
  useEffect(() => { load(); }, [load]);

  async function act(fn: () => Promise<EventDetail | unknown>, after?: (d: EventDetail) => void) {
    setBusy(true); setError('');
    try {
      const d = await fn();
      if (d && typeof d === 'object' && 'id' in d) { setE(d as EventDetail); after?.(d as EventDetail); } else await load();
      reloadMe();
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  if (!e) return error ? <div className="mx-auto max-w-2xl"><ErrorText>{error}</ErrorText></div> : <Spinner />;
  const state = eventState(e);
  const path = `/events/${e.id}`;
  const register = () => act(() => post<EventDetail>(`/events/${e.id}/register`));
  const unregister = () => {
    if (!window.confirm(e.myStatus === 'WAITLISTED' ? 'ออกจากคิวรอ?' : 'ยกเลิกการลงทะเบียน? ที่นั่งของคุณจะให้คนในคิวถัดไป')) return;
    act(() => api<EventDetail>(`/events/${e.id}/register`, { method: 'DELETE' }));
  };
  const notInterested = () => act(() => post(`/events/${e.id}/hide`)).then(() => router.push('/events'));
  const cancelEvent = () => {
    if (!window.confirm(e.status === 'PENDING_REVIEW' ? 'ยกเลิก Event นี้? ระบบจะคืน Coin ทั้งหมดรวมค่าโพสต์' : 'ยกเลิก Event นี้? ผู้ที่ลงทะเบียนจะเห็นว่างานถูกยกเลิก และ Coin รางวัลที่เหลือจะคืนให้คุณ (ค่าโพสต์ไม่คืน)')) return;
    act(() => post<EventDetail>(`/events/${e.id}/cancel`));
  };

  const registrationBadge = {
    open: ['เปิดลงทะเบียน', 'bg-success-soft text-success'],
    registered: ['ลงทะเบียนแล้ว', 'bg-success-soft text-success'],
    waitlisted: ['อยู่ในคิวรอ', 'bg-coin-soft text-warning-foreground'],
    full: ['ที่นั่งเต็ม', 'bg-destructive-soft text-destructive'],
    pending: ['รอแอดมินตรวจ', 'bg-coin-soft text-warning-foreground'],
    rejected: ['ไม่ผ่านการตรวจ', 'bg-destructive-soft text-destructive'],
    cancelled: ['ยกเลิกแล้ว', 'bg-destructive-soft text-destructive'],
    ended: ['จบแล้ว', 'bg-muted text-muted-foreground'],
  }[state];

  return (
    <div className="mx-auto max-w-2xl space-y-2.5 pb-8">
      <StatusBanner e={e} state={state} />

      <EventCover e={e} className="h-[150px] rounded-none sm:h-[200px] sm:rounded-2xl">
        <div className="flex items-start justify-between">
          <span className="rounded-full bg-white px-2.5 py-1.5 text-[11px] font-extrabold text-primary">
            {e.capacity === null ? 'ไม่จำกัดจำนวน' : e.isFull ? EVENT_CATEGORY_LABEL[e.category] : `ว่าง ${(e.capacity - e.registeredCount).toLocaleString()} ที่`}
          </span>
          <button type="button" aria-label="แชร์" onClick={async () => { const m = await shareLink(e.title, path); if (m) setToast(m); }}
            className="flex size-[34px] items-center justify-center rounded-full bg-white text-primary"><Share2 className="size-4" /></button>
        </div>
        <span className={cx('self-start rounded-full px-2.5 py-1.5 text-[11px] font-extrabold', registrationBadge[1])}>{registrationBadge[0]}</span>
      </EventCover>

      <div className="space-y-1.5">
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight">{e.title}</h1>
        <div className="flex items-center gap-2">
          <span className="flex size-[30px] items-center justify-center rounded-full bg-lavender text-[9px] font-extrabold text-primary">{hostMark(e.hostName)}</span>
          <div className="leading-tight">
            <p className="text-xs font-bold">{e.hostName}</p>
            <p className="text-[10px] text-muted-foreground">{e.organizerVerified ? 'ผู้จัดยืนยันอีเมล มช. แล้ว' : 'ผู้จัดยังไม่ยืนยันอีเมล มช.'}</p>
          </div>
          {e.organizerVerified && <BadgeCheck className="size-4 text-success" aria-label="ยืนยันแล้ว" />}
        </div>
      </div>

      <section className="rounded-2xl bg-card p-3">
        <h2 className="text-[15px] font-extrabold">เกี่ยวกับ Event</h2>
        <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground">{e.description}</p>
        {e.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">{e.tags.map((t) => <span key={t} className="rounded-full bg-lavender-soft px-2 py-1 text-[11px] font-bold text-primary">{t}</span>)}</div>
        )}
      </section>

      <section className="space-y-2 rounded-2xl bg-card p-3">
        <InfoRow icon={<CalendarDays />} label="วันและเวลา" value={eventTimeLong(e.startsAt, e.endsAt)} />
        <InfoRow icon={<MapPin />} label="สถานที่" value={e.location} />
        {e.rewardPerCheckIn > 0 && (
          <InfoRow icon={<Coins />} label="รางวัลเมื่อเช็กอินที่งาน" value={`+${e.rewardPerCheckIn} Coin · เหลือ ${e.rewardsLeft.toLocaleString()} สิทธิ์`} coin />
        )}
        {e.registrationUrl && (
          <InfoRow icon={<ExternalLink />} label="ฟอร์มลงทะเบียนของผู้จัด" value={<a href={e.registrationUrl} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{new URL(e.registrationUrl).host}</a>} />
        )}
      </section>

      <section className="flex items-center justify-between rounded-2xl bg-card p-3">
        <div className="leading-tight">
          <p className="text-xs font-extrabold">{e.registeredCount.toLocaleString()} คนเข้าร่วม{e.capacity !== null && ` จาก ${e.capacity.toLocaleString()} ที่`}</p>
          <p className="text-[10px] text-muted-foreground">
            {e.waitlistCount > 0 ? `รอคิวอีก ${e.waitlistCount.toLocaleString()} คน` : e.registeredCount ? 'มาร่วมงานกับเพื่อน ๆ ชาว มช.' : 'ยังไม่มีคนลงทะเบียน — เป็นคนแรกเลย'}
            {e.checkedInCount > 0 && ` · เช็กอินแล้ว ${e.checkedInCount.toLocaleString()} คน`}
          </p>
        </div>
        <div className="flex">
          {e.participantInitials.map((p, i) => (
            <span key={i} className={cx('-mr-1.5 flex size-7 items-center justify-center rounded-full border-2 border-white text-[8px] font-extrabold last:mr-0',
              ['bg-lavender', 'bg-coin-soft', 'bg-success-soft'][i % 3])}>{p}</span>
          ))}
        </div>
      </section>

      {e.isOrganizer && <OrganizerPanel e={e} />}

      <ErrorText>{error}</ErrorText>
      <Actions e={e} state={state} busy={busy}
        onRegister={register} onUnregister={unregister} onNotInterested={notInterested} onCancelEvent={cancelEvent}
        onCalendar={() => downloadIcs(e, `${window.location.origin}${path}`)} />
      {toast && <Toast onClose={() => setToast('')}>{toast}</Toast>}
    </div>
  );
}

function InfoRow({ icon, label, value, coin }: { icon: ReactNode; label: string; value: ReactNode; coin?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cx('flex size-[34px] shrink-0 items-center justify-center rounded-[10px] [&_svg]:size-4', coin ? 'bg-coin-soft text-warning' : 'bg-lavender-soft text-primary')}>{icon}</span>
      <div className="min-w-0 leading-snug">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <p className="text-[15px] font-bold">{value}</p>
      </div>
    </div>
  );
}

function StatusBanner({ e, state }: { e: EventDetail; state: ReturnType<typeof eventState> }) {
  if (e.myCheckedIn) {
    return (
      <Banner tone="success" icon={<CheckCircle2 />} title="เช็กอินแล้ว">
        {e.myReward > 0 ? `คุณได้รับ ${e.myReward} Coin จากการเข้าร่วมงานนี้` : 'ขอบคุณที่มาร่วมงาน'}
      </Banner>
    );
  }
  switch (state) {
    case 'registered':
      return (
        <Banner tone="success" icon={<Ticket />} title="คุณลงทะเบียนแล้ว">
          {e.registrationUrl
            ? <>บันทึกการลงทะเบียนใน TEMBO แล้ว กรอก <a href={e.registrationUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline">ฟอร์มของผู้จัด</a> ให้เรียบร้อยเพื่อยืนยันที่นั่ง</>
            : 'เจอกันที่งาน! เปิดหน้านี้แล้วสแกน QR ของผู้จัดเพื่อเช็กอิน'}
        </Banner>
      );
    case 'waitlisted':
      return (
        <Banner tone="warning" icon={<Hourglass />} title={`อยู่ในคิวรอ ลำดับที่ ${e.myWaitlistPosition ?? '-'}`}>
          ถ้ามีคนยกเลิก ระบบจะเลื่อนคุณขึ้นเป็นผู้ลงทะเบียนให้อัตโนมัติ
        </Banner>
      );
    case 'full':
      return <Banner tone="danger" icon={<XCircle />} title="ที่นั่งเต็มแล้ว">Event นี้เต็มแล้ว เข้าคิวรอไว้ได้ ถ้ามีที่ว่างระบบจะเลื่อนคุณขึ้นให้</Banner>;
    case 'pending':
      return <Banner tone="warning" icon={<Clock />} title="รอแอดมินตรวจ">Event จะขึ้นฟีดหลังแอดมินอนุมัติ ค่าโพสต์และ Coin รางวัลพักไว้ใน Escrow ก่อน</Banner>;
    case 'rejected':
      return <Banner tone="danger" icon={<XCircle />} title="แอดมินไม่อนุมัติ">{e.reviewNote ? `เหตุผล: ${e.reviewNote} · ` : ''}คืน Coin ทั้งหมดให้คุณแล้ว</Banner>;
    case 'cancelled':
      return <Banner tone="danger" icon={<Ban />} title="Event นี้ถูกยกเลิก">ผู้จัดยกเลิก Event นี้แล้ว</Banner>;
    case 'ended':
      return <Banner tone="info" icon={<CalendarDays />} title="Event นี้จบแล้ว">ขอบคุณทุกคนที่มาร่วมงาน</Banner>;
    default:
      return null;
  }
}

function OrganizerPanel({ e }: { e: EventDetail }) {
  return (
    <section className="space-y-2 rounded-2xl border border-primary/20 bg-lavender-soft p-3">
      <p className="text-xs font-extrabold text-primary">สำหรับผู้จัด</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="ลงทะเบียน" value={e.registeredCount} />
        <Stat label="คิวรอ" value={e.waitlistCount} />
        <Stat label="เช็กอิน" value={e.checkedInCount} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        ค่าโพสต์ {e.postFee} Coin · Coin ใน Escrow {e.escrowBalance?.toLocaleString() ?? 0}
        {e.rewardPerCheckIn > 0 && ` · จ่ายรางวัลแล้ว ${e.rewardedCount}/${e.rewardSlots} คน`}
        {' '}· เปิดเช็กอิน {timeOnly(e.checkInOpensAt)}–{timeOnly(e.checkInClosesAt)} น.
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-card py-2">
      <p className="text-lg font-extrabold">{value.toLocaleString()}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

const btn = 'flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] px-4 text-[15px] font-bold transition-colors disabled:opacity-50 [&_svg]:size-[17px]';
const outline = `${btn} border border-input bg-card text-indigo hover:bg-lavender-soft`;
const primary = `${btn} border border-primary bg-primary text-white hover:bg-primary/90`;
const danger = `${btn} bg-destructive text-white hover:bg-destructive/90`;

function Actions({ e, state, busy, onRegister, onUnregister, onNotInterested, onCancelEvent, onCalendar }: {
  e: EventDetail; state: ReturnType<typeof eventState>; busy: boolean;
  onRegister: () => void; onUnregister: () => void; onNotInterested: () => void; onCancelEvent: () => void; onCalendar: () => void;
}) {
  if (e.isOrganizer) {
    const live = e.status === 'PUBLISHED' && state !== 'ended';
    return (
      <div className="flex gap-2">
        {(live || e.status === 'PENDING_REVIEW') && <button type="button" disabled={busy} onClick={onCancelEvent} className={outline}><Ban />ยกเลิก Event</button>}
        {(e.status === 'PUBLISHED' || e.status === 'ENDED') && <Link href={`/events/${e.id}/manage`} className={primary}>{live ? <><QrCode />เปิด QR เช็กอิน</> : <><Settings2 />ดูผู้เข้าร่วม</>}</Link>}
      </div>
    );
  }
  if (e.myCheckedIn) return <div className="flex gap-2"><Link href="/events" className={outline}>หา Event อื่น</Link><button type="button" onClick={onCalendar} className={primary}><CalendarPlus />เพิ่มลงปฏิทิน</button></div>;
  switch (state) {
    case 'open':
      return (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={onNotInterested} className={outline}>ไม่สนใจ</button>
          <button type="button" disabled={busy} onClick={onRegister} className={primary}>{e.registrationUrl ? <ExternalLink /> : <Ticket />}ลงทะเบียน</button>
        </div>
      );
    case 'full':
      return (
        <div className="flex gap-2">
          <Link href="/events" className={outline}>หา Event อื่น</Link>
          <button type="button" disabled={busy} onClick={onRegister} className={primary}><Hourglass />เข้าคิวรอ</button>
        </div>
      );
    case 'registered':
      return (
        <div className="space-y-2">
          {e.registrationUrl && <a href={e.registrationUrl} target="_blank" rel="noopener noreferrer" className={cx(primary, 'w-full')}><ExternalLink />กรอกฟอร์มของผู้จัด</a>}
          {e.checkInOpen && <Link href={`/events/${e.id}/checkin`} className={cx(e.registrationUrl ? outline : primary, 'w-full')}><QrCode />เช็กอินเข้างาน</Link>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={onUnregister} className={danger}>ยกเลิกการลงทะเบียน</button>
            <button type="button" onClick={onCalendar} className={e.registrationUrl || e.checkInOpen ? outline : primary}><CalendarPlus />เพิ่มลงปฏิทิน</button>
          </div>
        </div>
      );
    case 'waitlisted':
      return (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={onUnregister} className={outline}>ออกจากคิว</button>
          <button type="button" onClick={onCalendar} className={primary}><CalendarPlus />เพิ่มลงปฏิทิน</button>
        </div>
      );
    default:
      return <Link href="/events" className={cx(outline, 'w-full')}>ดู Event อื่น</Link>;
  }
}
