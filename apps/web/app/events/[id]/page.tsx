'use client';
import { use, useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck, Ban, CalendarDays, CalendarPlus, CheckCircle2, Clock, Coins, ExternalLink, Hourglass,
  MapPin, QrCode, Settings2, Share2, Ticket, XCircle,
} from 'lucide-react';
import { EVENT_CATEGORY_LABEL, interestLabel, type EventDetail } from '@tembo/shared';
import { useT } from '@/lib/i18n';
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
  const { t, p, lang } = useT();
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
    if (!window.confirm(e.myStatus === 'WAITLISTED' ? t('Leave the waitlist?', 'ออกจากคิวรอ?') : t('Cancel your registration? Your spot will go to the next person in the waitlist.', 'ยกเลิกการลงทะเบียน? ที่นั่งของคุณจะให้คนในคิวถัดไป'))) return;
    act(() => api<EventDetail>(`/events/${e.id}/register`, { method: 'DELETE' }));
  };
  const notInterested = () => act(() => post(`/events/${e.id}/hide`)).then(() => router.push('/events'));
  const cancelEvent = () => {
    if (!window.confirm(e.status === 'PENDING_REVIEW' ? t('Cancel this event? All your Coin, including the posting fee, will be refunded.', 'ยกเลิกกิจกรรมนี้? ระบบจะคืน Coin ทั้งหมดรวมค่าโพสต์') : t('Cancel this event? Registered people will see that it was cancelled, and the remaining reward Coin will be returned to you (the posting fee is not refunded).', 'ยกเลิกกิจกรรมนี้? ผู้ที่ลงทะเบียนจะเห็นว่างานถูกยกเลิก และ Coin รางวัลที่เหลือจะคืนให้คุณ (ค่าโพสต์ไม่คืน)'))) return;
    act(() => post<EventDetail>(`/events/${e.id}/cancel`));
  };

  const registrationBadge = {
    open: [t('Open', 'เปิดลงทะเบียน'), 'bg-success-soft text-success'],
    registered: [t('Registered', 'ลงทะเบียนแล้ว'), 'bg-success-soft text-success'],
    waitlisted: [t('On waitlist', 'อยู่ในคิวรอ'), 'bg-coin-soft text-warning-foreground'],
    full: [t('Full', 'ที่นั่งเต็ม'), 'bg-destructive-soft text-destructive'],
    pending: [t('In review', 'รอแอดมินตรวจ'), 'bg-coin-soft text-warning-foreground'],
    rejected: [t('Not approved', 'ไม่ผ่านการตรวจ'), 'bg-destructive-soft text-destructive'],
    cancelled: [t('Cancelled', 'ยกเลิกแล้ว'), 'bg-destructive-soft text-destructive'],
    ended: [t('Ended', 'จบแล้ว'), 'bg-muted text-muted-foreground'],
  }[state];

  return (
    <div className="mx-auto max-w-2xl space-y-2.5 pb-8">
      <StatusBanner e={e} state={state} />

      <EventCover e={e} className="h-[150px] rounded-none sm:h-[200px] sm:rounded-2xl">
        <div className="flex items-start justify-between">
          <span className="rounded-full bg-white px-2.5 py-1.5 text-[11px] font-extrabold text-primary">
            {e.capacity === null ? t('Unlimited spots', 'ไม่จำกัดจำนวน') : e.isFull ? p(EVENT_CATEGORY_LABEL[e.category]) : t(`${(e.capacity - e.registeredCount).toLocaleString()} spots left`, `ว่าง ${(e.capacity - e.registeredCount).toLocaleString()} ที่`)}
          </span>
          <button type="button" aria-label={t('Share', 'แชร์')} onClick={async () => { const m = await shareLink(e.title, path, t); if (m) setToast(m); }}
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
            <p className="text-[10px] text-muted-foreground">{e.organizerVerified ? t('Organizer has a verified CMU email', 'ผู้จัดยืนยันอีเมล มช. แล้ว') : t('Organizer has not verified a CMU email', 'ผู้จัดยังไม่ยืนยันอีเมล มช.')}</p>
          </div>
          {e.organizerVerified && <BadgeCheck className="size-4 text-success" aria-label={t('Verified', 'ยืนยันแล้ว')} />}
        </div>
      </div>

      <section className="rounded-2xl bg-card p-3">
        <h2 className="text-[15px] font-extrabold">{t('About this event', 'เกี่ยวกับกิจกรรม')}</h2>
        <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground">{e.description}</p>
        {e.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">{e.tags.map((x) => <span key={x} className="rounded-full bg-lavender-soft px-2 py-1 text-[11px] font-bold text-primary">{p(interestLabel(x))}</span>)}</div>
        )}
      </section>

      <section className="space-y-2 rounded-2xl bg-card p-3">
        <InfoRow icon={<CalendarDays />} label={t('Date and time', 'วันและเวลา')} value={eventTimeLong(e.startsAt, e.endsAt, lang)} />
        <InfoRow icon={<MapPin />} label={t('Location', 'สถานที่')} value={e.location} />
        {e.rewardPerCheckIn > 0 && (
          <InfoRow icon={<Coins />} label={t('Reward for checking in', 'รางวัลเมื่อเช็กอินที่งาน')} value={t(`+${e.rewardPerCheckIn} Coin · ${e.rewardsLeft.toLocaleString()} left`, `+${e.rewardPerCheckIn} Coin · เหลือ ${e.rewardsLeft.toLocaleString()} สิทธิ์`)} coin />
        )}
        {e.registrationUrl && (
          <InfoRow icon={<ExternalLink />} label={t("Organizer's registration form", 'ฟอร์มลงทะเบียนของผู้จัด')} value={<a href={e.registrationUrl} target="_blank" rel="noopener noreferrer" className="break-all text-primary underline">{new URL(e.registrationUrl).host}</a>} />
        )}
      </section>

      <section className="flex items-center justify-between rounded-2xl bg-card p-3">
        <div className="leading-tight">
          <p className="text-xs font-extrabold">{e.capacity !== null ? t(`${e.registeredCount.toLocaleString()} of ${e.capacity.toLocaleString()} going`, `${e.registeredCount.toLocaleString()} คนเข้าร่วม จาก ${e.capacity.toLocaleString()} ที่`) : t(`${e.registeredCount.toLocaleString()} going`, `${e.registeredCount.toLocaleString()} คนเข้าร่วม`)}</p>
          <p className="text-[10px] text-muted-foreground">
            {e.waitlistCount > 0 ? t(`${e.waitlistCount.toLocaleString()} on the waitlist`, `รอคิวอีก ${e.waitlistCount.toLocaleString()} คน`) : e.registeredCount ? t('Join your CMU friends', 'มาร่วมงานกับเพื่อน ๆ ชาว มช.') : t('No one has registered yet. Be the first!', 'ยังไม่มีคนลงทะเบียน — เป็นคนแรกเลย')}
            {e.checkedInCount > 0 && t(` · ${e.checkedInCount.toLocaleString()} checked in`, ` · เช็กอินแล้ว ${e.checkedInCount.toLocaleString()} คน`)}
          </p>
        </div>
        <div className="flex">
          {e.participantInitials.map((ini, i) => (
            <span key={i} className={cx('-mr-1.5 flex size-7 items-center justify-center rounded-full border-2 border-white text-[8px] font-extrabold last:mr-0',
              ['bg-lavender', 'bg-coin-soft', 'bg-success-soft'][i % 3])}>{ini}</span>
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
  const { t } = useT();
  if (e.myCheckedIn) {
    return (
      <Banner tone="success" icon={<CheckCircle2 />} title={t('Checked in', 'เช็กอินแล้ว')}>
        {e.myReward > 0 ? t(`You got ${e.myReward} Coin for joining this event`, `คุณได้รับ ${e.myReward} Coin จากการเข้าร่วมงานนี้`) : t('Thanks for coming!', 'ขอบคุณที่มาร่วมงาน')}
      </Banner>
    );
  }
  switch (state) {
    case 'registered':
      return (
        <Banner tone="success" icon={<Ticket />} title={t("You're registered", 'คุณลงทะเบียนแล้ว')}>
          {e.registrationUrl
            ? <>{t('Saved in TEMBO. Fill in the ', 'บันทึกการลงทะเบียนใน TEMBO แล้ว กรอก ')}<a href={e.registrationUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline">{t("organizer's form", 'ฟอร์มของผู้จัด')}</a>{t(' to confirm your spot.', ' ให้เรียบร้อยเพื่อยืนยันที่นั่ง')}</>
            : t("See you there! Open this page and scan the organizer's QR to check in.", 'เจอกันที่งาน! เปิดหน้านี้แล้วสแกน QR ของผู้จัดเพื่อเช็กอิน')}
        </Banner>
      );
    case 'waitlisted':
      return (
        <Banner tone="warning" icon={<Hourglass />} title={t(`On the waitlist, position ${e.myWaitlistPosition ?? '-'}`, `อยู่ในคิวรอ ลำดับที่ ${e.myWaitlistPosition ?? '-'}`)}>
          {t('If someone cancels, you will be moved up automatically.', 'ถ้ามีคนยกเลิก ระบบจะเลื่อนคุณขึ้นเป็นผู้ลงทะเบียนให้อัตโนมัติ')}
        </Banner>
      );
    case 'full':
      return <Banner tone="danger" icon={<XCircle />} title={t('This event is full', 'ที่นั่งเต็มแล้ว')}>{t('Join the waitlist and you will be moved up if a spot opens.', 'กิจกรรมนี้เต็มแล้ว เข้าคิวรอไว้ได้ ถ้ามีที่ว่างระบบจะเลื่อนคุณขึ้นให้')}</Banner>;
    case 'pending':
      return <Banner tone="warning" icon={<Clock />} title={t('Waiting for admin review', 'รอแอดมินตรวจ')}>{t('Your event goes live after an admin approves it. The posting fee and reward Coin are held until then.', 'กิจกรรมจะขึ้นฟีดหลังแอดมินอนุมัติ ค่าโพสต์และ Coin รางวัลจะถูกพักไว้ก่อน')}</Banner>;
    case 'rejected':
      return <Banner tone="danger" icon={<XCircle />} title={t('Not approved by an admin', 'แอดมินไม่อนุมัติ')}>{e.reviewNote ? t(`Reason: ${e.reviewNote} · `, `เหตุผล: ${e.reviewNote} · `) : ''}{t('All your Coin has been refunded.', 'คืน Coin ทั้งหมดให้คุณแล้ว')}</Banner>;
    case 'cancelled':
      return <Banner tone="danger" icon={<Ban />} title={t('This event was cancelled', 'กิจกรรมนี้ถูกยกเลิก')}>{t('The organizer cancelled this event.', 'ผู้จัดยกเลิกกิจกรรมนี้แล้ว')}</Banner>;
    case 'ended':
      return <Banner tone="info" icon={<CalendarDays />} title={t('This event has ended', 'กิจกรรมนี้จบแล้ว')}>{t('Thanks to everyone who came!', 'ขอบคุณทุกคนที่มาร่วมงาน')}</Banner>;
    default:
      return null;
  }
}

function OrganizerPanel({ e }: { e: EventDetail }) {
  const { t } = useT();
  return (
    <section className="space-y-2 rounded-2xl border border-primary/20 bg-lavender-soft p-3">
      <p className="text-xs font-extrabold text-primary">{t('For organizers', 'สำหรับผู้จัด')}</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label={t('Registered', 'ลงทะเบียน')} value={e.registeredCount} />
        <Stat label={t('Waitlist', 'คิวรอ')} value={e.waitlistCount} />
        <Stat label={t('Checked in', 'เช็กอิน')} value={e.checkedInCount} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {t('Posting fee', 'ค่าโพสต์')} {e.postFee} Coin · {t('Reward Coin held', 'Coin รางวัลที่พักไว้')} {e.escrowBalance?.toLocaleString() ?? 0}
        {e.rewardPerCheckIn > 0 && t(` · rewards paid ${e.rewardedCount}/${e.rewardSlots}`, ` · จ่ายรางวัลแล้ว ${e.rewardedCount}/${e.rewardSlots} คน`)}
        {' '}· {t('check-in', 'เปิดเช็กอิน')} {timeOnly(e.checkInOpensAt)}–{timeOnly(e.checkInClosesAt)}{t('', ' น.')}
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
  const { t } = useT();
  if (e.isOrganizer) {
    const live = e.status === 'PUBLISHED' && state !== 'ended';
    return (
      <div className="flex gap-2">
        {(live || e.status === 'PENDING_REVIEW') && <button type="button" disabled={busy} onClick={onCancelEvent} className={outline}><Ban />{t('Cancel event', 'ยกเลิกกิจกรรม')}</button>}
        {(e.status === 'PUBLISHED' || e.status === 'ENDED') && <Link href={`/events/${e.id}/manage`} className={primary}>{live ? <><QrCode />{t('Open check-in QR', 'เปิด QR เช็กอิน')}</> : <><Settings2 />{t('View attendees', 'ดูผู้เข้าร่วม')}</>}</Link>}
      </div>
    );
  }
  if (e.myCheckedIn) return <div className="flex gap-2"><Link href="/events" className={outline}>{t('Find other events', 'หากิจกรรมอื่น')}</Link><button type="button" onClick={onCalendar} className={primary}><CalendarPlus />{t('Add to calendar', 'เพิ่มลงปฏิทิน')}</button></div>;
  switch (state) {
    case 'open':
      return (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={onNotInterested} className={outline}>{t('Not interested', 'ไม่สนใจ')}</button>
          <button type="button" disabled={busy} onClick={onRegister} className={primary}>{e.registrationUrl ? <ExternalLink /> : <Ticket />}{t('Register', 'ลงทะเบียน')}</button>
        </div>
      );
    case 'full':
      return (
        <div className="flex gap-2">
          <Link href="/events" className={outline}>{t('Find other events', 'หากิจกรรมอื่น')}</Link>
          <button type="button" disabled={busy} onClick={onRegister} className={primary}><Hourglass />{t('Join waitlist', 'เข้าคิวรอ')}</button>
        </div>
      );
    case 'registered':
      return (
        <div className="space-y-2">
          {e.registrationUrl && <a href={e.registrationUrl} target="_blank" rel="noopener noreferrer" className={cx(primary, 'w-full')}><ExternalLink />{t("Fill in the organizer's form", 'กรอกฟอร์มของผู้จัด')}</a>}
          {e.checkInOpen && <Link href={`/events/${e.id}/checkin`} className={cx(e.registrationUrl ? outline : primary, 'w-full')}><QrCode />{t('Check in', 'เช็กอินเข้างาน')}</Link>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={onUnregister} className={danger}>{t('Cancel registration', 'ยกเลิกการลงทะเบียน')}</button>
            <button type="button" onClick={onCalendar} className={e.registrationUrl || e.checkInOpen ? outline : primary}><CalendarPlus />{t('Add to calendar', 'เพิ่มลงปฏิทิน')}</button>
          </div>
        </div>
      );
    case 'waitlisted':
      return (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={onUnregister} className={outline}>{t('Leave waitlist', 'ออกจากคิว')}</button>
          <button type="button" onClick={onCalendar} className={primary}><CalendarPlus />{t('Add to calendar', 'เพิ่มลงปฏิทิน')}</button>
        </div>
      );
    default:
      return <Link href="/events" className={cx(outline, 'w-full')}>{t('See other events', 'ดูกิจกรรมอื่น')}</Link>;
  }
}
