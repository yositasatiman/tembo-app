'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, post } from '@/lib/api';
import { AppShell } from '@/components/shell';
import { Button, Card, ErrorText, fmtDate, SectionHeader } from '@/components/ui';

interface Pending {
  id: string; title: string; description: string | null; questionCount: number; rewardPerResponse: number;
  quota: number; targetPool: number; subsidyAmount: number; createdAt: string;
  owner: { displayName: string | null; email: string; cmuEmail: string | null; faculty: string | null };
}

export default function AdminPage() {
  return <AppShell><Admin /></AppShell>;
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
    <div className="max-w-3xl space-y-4">
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
