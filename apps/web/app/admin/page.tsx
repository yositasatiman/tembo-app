'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, post } from '@/lib/api';
import { AppShell } from '@/components/shell';
import { EVENT_CATEGORY_LABEL, type EventCategory, facultyLabel } from '@tembo/shared';
import { Button, Card, ErrorText, fmtDate, SectionHeader } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { eventTimeShort } from '@/components/event/util';
import { AdminRewards } from './rewards';
import { GrantCoins } from './grant-coins';

interface Pending {
  id: string; title: string; description: string | null; questionCount: number; rewardPerResponse: number;
  quota: number; targetPool: number; subsidyAmount: number; createdAt: string;
  owner: { displayName: string | null; email: string; cmuEmail: string | null; faculty: string | null };
}

interface PendingEvent {
  id: string; title: string; description: string; hostName: string; category: EventCategory; location: string;
  startsAt: string; endsAt: string; capacity: number | null; registrationUrl: string | null; coverUrl: string | null;
  rewardPerCheckIn: number; rewardSlots: number; createdAt: string;
  organizer: { displayName: string | null; email: string; cmuEmail: string | null; faculty: string | null };
}

export default function AdminPage() {
  const { t } = useT();
  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight">{t('Admin', 'แอดมิน')}</h1>
          <p className="text-xs text-muted-foreground">{t('Review events before they go live, review subsidy requests and manage rewards', 'ตรวจกิจกรรมก่อนขึ้นฟีด ตรวจการขอระบบสมทบ และจัดการร้านรางวัล')}</p>
        </div>
        <AdminEvents />
        <Admin />
        <AdminRewards />
        <GrantCoins />
      </div>
    </AppShell>
  );
}

function AdminEvents() {
  const { t, p, lang } = useT();
  const [rows, setRows] = useState<PendingEvent[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api<PendingEvent[]>('/admin/events').then(setRows).catch((e) => {
    setError(e instanceof ApiError && e.status === 403 ? t('This page is for admins only', 'หน้านี้สำหรับแอดมินเท่านั้น') : (e as Error).message);
  }), []);
  useEffect(() => { load(); }, [load]);

  async function review(id: string, approve: boolean) {
    const note = approve ? undefined : window.prompt(t('Reason for rejecting (the organizer will see this)', 'เหตุผลที่ไม่อนุมัติ (ผู้จัดจะเห็น)')) ?? undefined;
    if (!approve && note === undefined) return;
    try { await post(`/admin/events/${id}/review`, { approve, note }); load(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title={t('Events awaiting review', 'กิจกรรมรอตรวจ')} subtitle={t('Approved events go live right away and the posting fee is charged. Rejected events get all their Coin back.', 'อนุมัติแล้วกิจกรรมจะขึ้นฟีดทันทีและค่าโพสต์ถูกหัก / ไม่อนุมัติ ระบบคืน Coin ทั้งหมดให้ผู้จัด')} />
      <ErrorText>{error}</ErrorText>
      {rows?.length === 0 && <Card className="py-10 text-center text-sm text-muted-foreground">{t('No events waiting for review', 'ไม่มีกิจกรรมรอตรวจ')}</Card>}
      {rows?.map((r) => (
        <Card key={r.id} className="space-y-3 p-6">
          <Link href={`/events/${r.id}`} className="font-extrabold hover:text-primary">{r.title}</Link>
          <p className="text-xs text-muted-foreground">{p(EVENT_CATEGORY_LABEL[r.category])} · {t('by', 'โดย')} {r.hostName} · {eventTimeShort(r.startsAt, r.endsAt, lang)} · {r.location}</p>
          <p className="line-clamp-4 text-sm whitespace-pre-line">{r.description}</p>
          <p className="text-xs text-muted-foreground">
            {t('Posted by', 'ผู้โพสต์')}: {r.organizer.displayName} · {r.organizer.faculty ? p(facultyLabel(r.organizer.faculty)) : ''} · {r.organizer.cmuEmail ?? t(`${r.organizer.email} (CMU not verified)`, `${r.organizer.email} (ยังไม่ยืนยัน มช.)`)}<br />
            {r.capacity ? t(`${r.capacity} spots`, `รับ ${r.capacity} คน`) : t('Unlimited spots', 'ไม่จำกัดจำนวน')}
            {r.rewardPerCheckIn > 0 && t(` · reward ${r.rewardPerCheckIn} × ${r.rewardSlots} people`, ` · รางวัล ${r.rewardPerCheckIn} × ${r.rewardSlots} คน`)}
            {r.registrationUrl && <> · {t('Form', 'ฟอร์ม')}: <a href={r.registrationUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{r.registrationUrl}</a></>}
            {' '}· {t('submitted', 'ส่งเมื่อ')} {fmtDate(r.createdAt)}
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => review(r.id, true)}>{t('Approve', 'อนุมัติ')}</Button>
            <Button variant="outline" className="flex-1" onClick={() => review(r.id, false)}>{t('Reject', 'ไม่อนุมัติ')}</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Admin() {
  const { t } = useT();
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api<Pending[]>('/admin/subsidies').then(setRows).catch((e) => {
    setError(e instanceof ApiError && e.status === 403 ? t('This page is for admins only', 'หน้านี้สำหรับแอดมินเท่านั้น') : (e as Error).message);
  }), []);
  useEffect(() => { load(); }, [load]);

  async function review(id: string, approve: boolean) {
    const note = approve ? undefined : window.prompt(t('Reason for rejecting (the owner will see this)', 'เหตุผลที่ไม่อนุมัติ (ผู้โพสต์จะเห็น)')) ?? undefined;
    if (!approve && note === undefined) return;
    try { await post(`/admin/surveys/${id}/subsidy`, { approve, note }); load(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title={t('Subsidy requests', 'ขอระบบสมทบ')} subtitle={t('Check that it is real research before approving. TEMBO adds the Coin to the reward pool right away.', 'ตรวจว่าเป็นงานวิจัยจริงก่อนอนุมัติ — ระบบจะเพิ่ม Coin เข้ารางวัลทันที')} />
      <ErrorText>{error}</ErrorText>
      {rows?.length === 0 && <Card className="py-10 text-center text-sm text-muted-foreground">{t('Nothing waiting for review', 'ไม่มีรายการรอตรวจ')}</Card>}
      {rows?.map((r) => (
        <Card key={r.id} className="space-y-3 p-6">
          <Link href={`/surveys/${r.id}`} className="font-extrabold hover:text-primary">{r.title}</Link>
          {r.description && <p className="whitespace-pre-line text-sm">{r.description}</p>}
          <p className="text-xs text-muted-foreground">
            {r.owner.displayName} · {r.owner.faculty} · {r.owner.cmuEmail}<br />
            {t(`${r.questionCount} questions`, `${r.questionCount} ข้อ`)} · {r.rewardPerResponse} × {r.quota} = {r.targetPool} Coin · {t('requested', 'ขอสมทบ')} <b>{r.subsidyAmount}</b> · {fmtDate(r.createdAt)}
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => review(r.id, true)}>{t('Approve', 'อนุมัติ')}</Button>
            <Button variant="outline" className="flex-1" onClick={() => review(r.id, false)}>{t('Reject', 'ไม่อนุมัติ')}</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
