'use client';
import { FormEvent, use, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SurveyDetail } from '@tembo/shared';
import { api, ApiError, post } from '@/lib/api';
import { Button, Card, ErrorText, fmtDate, inputCls, StatusBadge, TopBar } from '@/components/ui';

export default function SurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [s, setS] = useState<SurveyDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => api<SurveyDetail>(`/surveys/${id}`).then(setS).catch((e) => {
    if (e instanceof ApiError && e.status === 404) setNotFound(true); else router.replace('/login');
  }), [id, router]);
  useEffect(() => { load(); }, [load]);

  if (notFound) return <div><TopBar /><Card className="text-center">ไม่พบแบบสอบถาม</Card></div>;
  if (!s) return <p className="pt-32 text-center text-slate-500">กำลังโหลด…</p>;

  const total = s.targetPool || 1;
  const seg = [
    { v: s.funded.owner, cls: 'bg-brand-600', label: 'ผู้โพสต์' },
    { v: s.funded.system, cls: 'bg-emerald-500', label: 'ระบบสมทบ' },
    { v: s.funded.sponsors, cls: 'bg-sky-500', label: `เพื่อน ${s.funded.sponsorCount} คน` },
    { v: s.subsidyStatus === 'PENDING' ? s.subsidyAmount : 0, cls: 'bg-emerald-200', label: 'สมทบ (รอตรวจ)' },
  ];

  return (
    <div className="space-y-4">
      <TopBar />
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xl font-bold leading-snug">{s.title}</h2>
          <StatusBadge status={s.status} />
        </div>
        <p className="text-sm text-slate-500">โดย {s.ownerName ?? 'ไม่ระบุชื่อ'} · {s.questionCount} ข้อ · ปิด {fmtDate(s.closesAt)}</p>
        {s.description && <p className="whitespace-pre-line text-sm text-slate-700">{s.description}</p>}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat k="รางวัล/คน" v={`${s.rewardPerResponse}`} />
          <Stat k="ตอบแล้ว" v={`${s.responsesCount}/${s.quota}`} />
          <Stat k="รับได้อีก" v={`${s.payableResponses} คน`} />
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="flex justify-between text-sm"><b>ยอดรางวัลรวม</b><span>{s.targetPool.toLocaleString()} Coin</span></div>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
          {seg.map((x) => x.v > 0 && <div key={x.label} className={x.cls} style={{ width: `${(x.v / total) * 100}%` }} title={`${x.label} ${x.v}`} />)}
        </div>
        <ul className="grid grid-cols-2 gap-1 text-xs text-slate-600">
          {seg.filter((x) => x.v > 0).map((x) => <li key={x.label} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${x.cls}`} />{x.label} {x.v}</li>)}
          {s.remainingToFund > 0 && <li className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-slate-300" />ยังขาด {s.remainingToFund}</li>}
        </ul>
        <p className="text-xs text-slate-500">Coin ใน Escrow ตอนนี้ {s.escrowBalance.toLocaleString()}{s.postFee ? ` · ค่าโพสต์ ${s.postFee}` : ''}</p>
        {s.subsidyStatus === 'PENDING' && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">รอแอดมินตรวจการขอระบบสมทบ — ระหว่างนี้ยังไม่รับคำตอบ</p>}
        {s.subsidyStatus === 'REJECTED' && s.subsidyNote && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">ไม่ได้รับการสมทบ: {s.subsidyNote}</p>}
      </Card>

      {msg && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</p>}

      {!s.isOwner && s.status !== 'CLOSED' && (
        <Card className="space-y-2">
          <h3 className="font-bold">ตอบแบบสอบถาม</h3>
          {s.hasResponded ? <p className="text-sm text-emerald-700">✓ คุณตอบแล้ว</p>
            : s.canRespond ? <RespondButton s={s} onDone={(m) => { setMsg(m); load(); }} />
            : <p className="text-sm text-slate-500">{s.respondBlockedReason}</p>}
        </Card>
      )}

      {s.status !== 'CLOSED' && s.remainingToFund > 0 && !s.hasResponded && (
        <SponsorCard s={s} onDone={(m) => { setMsg(m); load(); }} />
      )}

      {s.isOwner && s.status !== 'CLOSED' && <CloseCard s={s} onDone={(m) => { setMsg(m); load(); }} />}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return <div className="rounded-xl bg-brand-50 py-2"><p className="text-lg font-bold text-brand-700">{v}</p><p className="text-xs text-slate-500">{k}</p></div>;
}

function RespondButton({ s, onDone }: { s: SurveyDetail; onDone: (m: string) => void }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function go() {
    setError(''); setLoading(true);
    try {
      const r = await post<{ reward: number; balance: number }>(`/surveys/${s.id}/responses`);
      onDone(`ได้รับ ${r.reward} Coin แล้ว (คงเหลือ ${r.balance})`);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }
  return (
    <div className="space-y-2">
      <Button onClick={go} disabled={loading}>ฉันตอบครบแล้ว รับ {s.rewardPerResponse} Coin</Button>
      <p className="text-xs text-slate-500">โหมดทดลองของขั้นที่ 2 — ขั้นที่ 3 จะเปลี่ยนเป็นแบบฟอร์มคำตอบจริง</p>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function SponsorCard({ s, onDone }: { s: SurveyDetail; onDone: (m: string) => void }) {
  const [amount, setAmount] = useState(Math.min(50, s.remainingToFund));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try { await post(`/surveys/${s.id}/sponsor`, { amount }); onDone(`${s.isOwner ? 'เติม' : 'สนับสนุน'} ${amount} Coin แล้ว`); }
    catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }
  return (
    <Card>
      <form onSubmit={submit} className="space-y-2">
        <h3 className="font-bold">{s.isOwner ? 'เติม Coin รางวัล' : 'ช่วยสนับสนุน'}</h3>
        <p className="text-xs text-slate-500">
          {s.isOwner ? 'เพิ่มจำนวนคนที่รับรางวัลได้' : 'โอน Coin เข้ารางวัลของแบบสอบถามนี้ — ผู้สนับสนุนจะตอบแบบสอบถามนี้ไม่ได้'} · ที่เหลือตอนปิดรับจะคืนตามสัดส่วน
          {s.myContribution > 0 && ` · คุณลงแล้ว ${s.myContribution}`}
        </p>
        <div className="flex gap-2">
          <input type="number" className={inputCls} min={1} max={s.remainingToFund} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          <Button className="!w-auto shrink-0" disabled={loading || amount < 1}>ลง Coin</Button>
        </div>
        <ErrorText>{error}</ErrorText>
      </form>
    </Card>
  );
}

function CloseCard({ s, onDone }: { s: SurveyDetail; onDone: (m: string) => void }) {
  const [error, setError] = useState('');
  async function close() {
    if (!window.confirm('ปิดรับแบบสอบถามนี้? Coin ที่เหลือจะคืนตามสัดส่วนทันที และเปิดใหม่ไม่ได้')) return;
    setError('');
    try { await post(`/surveys/${s.id}/close`); onDone('ปิดรับแล้ว คืน Coin ที่เหลือเรียบร้อย'); }
    catch (e) { setError((e as Error).message); }
  }
  return (
    <Card className="space-y-2">
      <button onClick={close} className="w-full rounded-xl border border-red-200 px-4 py-3 font-semibold text-red-600 hover:bg-red-50">ปิดรับแบบสอบถาม</button>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
