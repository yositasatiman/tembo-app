'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, post } from '@/lib/api';
import { AppShell } from '@/components/shell';
import { EVENT_CATEGORY_LABEL, type EventCategory } from '@tembo/shared';
import { Button, Card, ErrorText, fmtDate, SectionHeader } from '@/components/ui';
import { eventTimeShort } from '@/components/event/util';

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
  return <AppShell><div className="max-w-3xl space-y-8"><AdminEvents /><Admin /></div></AppShell>;
}

function AdminEvents() {
  const [rows, setRows] = useState<PendingEvent[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api<PendingEvent[]>('/admin/events').then(setRows).catch((e) => {
    setError(e instanceof ApiError && e.status === 403 ? 'หน้านี้สำหรับแอดมินเท่านั้น' : (e as Error).message);
  }), []);
  useEffect(() => { load(); }, [load]);

  async function review(id: string, approve: boolean) {
    const note = approve ? undefined : window.prompt('เหตุผลที่ไม่อนุมัติ (ผู้จัดจะเห็น)') ?? undefined;
    if (!approve && note === undefined) return;
    try { await post(`/admin/events/${id}/review`, { approve, note }); load(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="แอดมิน: ตรวจ Event" subtitle="อนุมัติแล้ว Event จะขึ้นฟีดทันทีและค่าโพสต์ถูกหัก / ไม่อนุมัติ ระบบคืน Coin ทั้งหมดให้ผู้จัด" />
      <ErrorText>{error}</ErrorText>
      {rows?.length === 0 && <Card className="py-10 text-center text-sm text-muted-foreground">ไม่มี Event รอตรวจ</Card>}
      {rows?.map((r) => (
        <Card key={r.id} className="space-y-3 p-6">
          <Link href={`/events/${r.id}`} className="font-extrabold hover:text-primary">{r.title}</Link>
          <p className="text-xs text-muted-foreground">{EVENT_CATEGORY_LABEL[r.category]} · โดย {r.hostName} · {eventTimeShort(r.startsAt, r.endsAt)} · {r.location}</p>
          <p className="line-clamp-4 text-sm whitespace-pre-line">{r.description}</p>
          <p className="text-xs text-muted-foreground">
            ผู้โพสต์: {r.organizer.displayName} · {r.organizer.faculty} · {r.organizer.cmuEmail ?? `${r.organizer.email} (ยังไม่ยืนยัน มช.)`}<br />
            {r.capacity ? `รับ ${r.capacity} คน` : 'ไม่จำกัดจำนวน'}
            {r.rewardPerCheckIn > 0 && ` · รางวัล ${r.rewardPerCheckIn} × ${r.rewardSlots} คน`}
            {r.registrationUrl && <> · ฟอร์ม: <a href={r.registrationUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">{r.registrationUrl}</a></>}
            {' '}· ส่งเมื่อ {fmtDate(r.createdAt)}
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => review(r.id, true)}>อนุมัติ</Button>
            <Button variant="outline" className="flex-1" onClick={() => review(r.id, false)}>ไม่อนุมัติ</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function Admin() {
  const [rows, setRows] = useState<Pending[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api<Pending[]>('/admin/subsidies').then(setRows).catch((e) => {
    setError(e instanceof ApiError && e.status === 403 ? 'หน้านี้สำหรับแอดมินเท่านั้น' : (e as Error).message);
  }), []);
  useEffect(() => { load(); }, [load]);

  async function review(id: string, approve: boolean) {
    const note = approve ? undefined : window.prompt('เหตุผลที่ไม่อนุมัติ (ผู้โพสต์จะเห็น)') ?? undefined;
    if (!approve && note === undefined) return;
    try { await post(`/admin/surveys/${id}/subsidy`, { approve, note }); load(); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="แอดมิน: ตรวจการขอระบบสมทบ" subtitle="ตรวจว่าเป็นงานวิจัยจริงก่อนอนุมัติ — ระบบจะสร้าง Coin เข้า Escrow ทันที" />
      <ErrorText>{error}</ErrorText>
      {rows?.length === 0 && <Card className="py-10 text-center text-sm text-muted-foreground">ไม่มีรายการรอตรวจ</Card>}
      {rows?.map((r) => (
        <Card key={r.id} className="space-y-3 p-6">
          <Link href={`/surveys/${r.id}`} className="font-display font-semibold hover:text-primary">{r.title}</Link>
          {r.description && <p className="whitespace-pre-line text-sm">{r.description}</p>}
          <p className="text-xs text-muted-foreground">
            {r.owner.displayName} · {r.owner.faculty} · {r.owner.cmuEmail}<br />
            {r.questionCount} ข้อ · {r.rewardPerResponse} × {r.quota} = {r.targetPool} Coin · ขอสมทบ <b>{r.subsidyAmount}</b> · {fmtDate(r.createdAt)}
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => review(r.id, true)}>อนุมัติ</Button>
            <Button variant="outline" className="flex-1" onClick={() => review(r.id, false)}>ไม่อนุมัติ</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
