'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, post } from '@/lib/api';
import { Card, ErrorText, fmtDate, TopBar } from '@/components/ui';

interface Pending {
  id: string; title: string; description: string | null; questionCount: number; rewardPerResponse: number;
  quota: number; targetPool: number; subsidyAmount: number; createdAt: string;
  owner: { displayName: string | null; email: string; cmuEmail: string | null; faculty: string | null };
}

export default function AdminPage() {
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
      <TopBar />
      <h2 className="text-xl font-bold">แอดมิน: ตรวจการขอระบบสมทบ</h2>
      <ErrorText>{error}</ErrorText>
      {rows?.length === 0 && <Card className="text-center text-sm text-slate-500">ไม่มีรายการรอตรวจ</Card>}
      {rows?.map((r) => (
        <Card key={r.id} className="space-y-2">
          <Link href={`/surveys/${r.id}`} className="font-bold underline">{r.title}</Link>
          {r.description && <p className="whitespace-pre-line text-sm text-slate-600">{r.description}</p>}
          <p className="text-xs text-slate-500">
            {r.owner.displayName} · {r.owner.faculty} · {r.owner.cmuEmail}<br />
            {r.questionCount} ข้อ · {r.rewardPerResponse} × {r.quota} = {r.targetPool} Coin · ขอสมทบ <b>{r.subsidyAmount}</b> · {fmtDate(r.createdAt)}
          </p>
          <div className="flex gap-2">
            <button onClick={() => review(r.id, true)} className="flex-1 rounded-xl bg-emerald-600 py-2 font-semibold text-white">อนุมัติ</button>
            <button onClick={() => review(r.id, false)} className="flex-1 rounded-xl border border-slate-300 py-2 font-semibold">ไม่อนุมัติ</button>
          </div>
        </Card>
      ))}
    </div>
  );
}
