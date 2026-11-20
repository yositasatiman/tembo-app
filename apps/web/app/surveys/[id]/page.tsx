'use client';
import { FormEvent, use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, CalendarDays, CheckCircle2, Clock3, Coins, Eye, Gift, HandCoins, ListChecks, Lock, Shapes, Trophy, UserCheck, Users } from 'lucide-react';
import { estMinutesLabel, SURVEY_CATEGORIES, type SurveyDetail } from '@tembo/shared';
import { api, ApiError, post } from '@/lib/api';
import { AppShell, useMe } from '@/components/shell';
import { ExternalOwnerSetup, ExternalRespond } from '@/components/survey/external';
import { ScriptOwnerSetup, ScriptRespond } from '@/components/survey/script';
import { Badge, Button, buttonCls, Card, ErrorText, fmtDate, inputCls, Notice, Progress, Spinner, StatusBadge } from '@/components/ui';

export default function SurveyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AppShell><SurveyView id={id} /></AppShell>;
}

function SurveyView({ id }: { id: string }) {
  const { reload: reloadMe } = useMe();
  const [s, setS] = useState<SurveyDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => api<SurveyDetail>(`/surveys/${id}`).then(setS).catch((e) => {
    if (e instanceof ApiError && e.status === 404) setNotFound(true);
  }), [id]);
  useEffect(() => { load(); }, [load]);
  const done = (m: string) => { setMsg(m); load(); reloadMe(); };

  if (notFound) return <Card className="py-10 text-center">ไม่พบแบบสอบถาม</Card>;
  if (!s) return <Spinner />;

  const pct = s.quota ? Math.round((s.responsesCount / s.quota) * 100) : 0;
  const total = s.targetPool || 1;
  const seg = [
    { v: s.funded.owner, cls: 'bg-primary', label: 'ผู้โพสต์' },
    { v: s.funded.system, cls: 'bg-success', label: 'ระบบสมทบ' },
    { v: s.funded.sponsors, cls: 'bg-sky', label: `เพื่อน ${s.funded.sponsorCount} คน` },
    { v: s.subsidyStatus === 'PENDING' ? s.subsidyAmount : 0, cls: 'bg-success/40', label: 'สมทบ (รอตรวจ)' },
  ];

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/surveys" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />กลับไปฟีด</Link>

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex gap-1.5"><StatusBadge status={s.status} />{s.isOwner && <Badge tone="outline">ของคุณ</Badge>}</div>
            <h1 className="text-xl leading-snug font-extrabold">{s.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{s.ownerName ?? 'ไม่ระบุชื่อ'}{s.ownerFaculty && ` · คณะ${s.ownerFaculty}`}</p>
          </div>
          <Badge tone="solid" className="px-3 py-1 text-sm">{s.rewardMode === 'DRAW' ? <><Gift />ลุ้นสูงสุด {s.rewardPerResponse} Coin</> : <><Coins />{s.rewardPerResponse} Coin / คน</>}</Badge>
        </div>
        {s.description && <p className="whitespace-pre-line text-sm leading-relaxed">{s.description}</p>}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">ตอบแล้ว {s.responsesCount}/{s.quota} คน</span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
          <Progress value={pct} />
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground [&_svg]:size-3.5">
          <span className="flex items-center gap-1.5"><CalendarDays />ปิด {fmtDate(s.closesAt)}</span>
          <span className="flex items-center gap-1.5"><ListChecks />{s.questionCount} ข้อ</span>
          <span className="flex items-center gap-1.5"><Users />{s.rewardMode === 'DRAW' ? `รับอีก ${s.payableResponses} คน` : `รับรางวัลได้อีก ${s.payableResponses} คน`}</span>
          {s.category && <span className="flex items-center gap-1.5"><Shapes />{SURVEY_CATEGORIES[s.category]}</span>}
          {s.estMinutes && <span className="flex items-center gap-1.5"><Clock3 />{estMinutesLabel(s.estMinutes)}</span>}
          {(s.eligibleFaculties.length > 0 || s.eligibleYears.length > 0) && (
            <span className="flex items-center gap-1.5"><UserCheck />
              {[s.eligibleFaculties.length ? `คณะ${s.eligibleFaculties.join(', ')}` : null, s.eligibleYears.length ? `ปี ${s.eligibleYears.join(', ')}` : null].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
      </Card>

      {msg && <Notice tone="success">{msg}</Notice>}

      {s.isOwner && s.status !== 'CLOSED' && s.externalVerify === 'CODE' && <ExternalOwnerSetup s={s} />}
      {s.isOwner && s.status !== 'CLOSED' && s.externalVerify === 'SCRIPT' && <ScriptOwnerSetup s={s} reload={load} />}

      {!s.isOwner && s.externalVerify === 'SCRIPT' && (s.hasResponded || (s.status !== 'CLOSED' && s.canRespond)) && <ScriptRespond s={s} reload={() => { load(); reloadMe(); }} />}

      {!s.isOwner && s.status !== 'CLOSED' && s.externalVerify === 'CODE' && s.canRespond && (
        <ExternalRespond s={s} onDone={(r) => done(`ยืนยันการตอบแล้ว ได้รับ ${r} Coin`)} />
      )}

      {s.rewardMode === 'DRAW' && <DrawCard s={s} />}

      {!s.isOwner && s.status !== 'CLOSED' && (s.externalVerify !== 'SCRIPT' ? (s.mode === 'IN_APP' || !s.canRespond) : (!s.canRespond && !s.hasResponded)) && (
        <Card className="space-y-3">
          <h3 className="font-extrabold">ตอบแบบสอบถาม</h3>
          {s.hasResponded ? <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" />คุณตอบแล้ว</p>
            : s.canRespond ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{s.questionCount} ข้อ · ตอบครบรับ {s.rewardPerResponse} Coin ทันที</p>
                <Link href={`/surveys/${s.id}/answer`} className={buttonCls('primary')}>เริ่มทำแบบสอบถาม</Link>
              </div>
            )
            : <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" />{s.respondBlockedReason}</p>}
        </Card>
      )}

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold">Coin รางวัล (Escrow)</h3>
          <span className="text-sm text-muted-foreground">รวม {s.targetPool.toLocaleString()} Coin</span>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
          {seg.map((x) => x.v > 0 && <div key={x.label} className={x.cls} style={{ width: `${(x.v / total) * 100}%` }} title={`${x.label} ${x.v}`} />)}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {seg.filter((x) => x.v > 0).map((x) => <li key={x.label} className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${x.cls}`} />{x.label} {x.v}</li>)}
          {s.remainingToFund > 0 && <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-muted-foreground/30" />ยังขาด {s.remainingToFund}</li>}
        </ul>
        <p className="text-xs text-muted-foreground">คงเหลือใน Escrow {s.escrowBalance.toLocaleString()} Coin{s.postFee ? ` · ค่าโพสต์ ${s.postFee} Coin` : ' · โพสต์แรกฟรี'}</p>
        {s.subsidyStatus === 'PENDING' && <Notice tone="warning">รอแอดมินตรวจการขอระบบสมทบ — ระหว่างนี้ยังไม่รับคำตอบ แต่เพื่อนช่วยสนับสนุนได้</Notice>}
        {s.subsidyStatus === 'REJECTED' && s.subsidyNote && <Notice>ไม่ได้รับการสมทบ: {s.subsidyNote}</Notice>}
      </Card>

      {s.isOwner && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold">ผลลัพธ์</h3>
            <p className="text-sm text-muted-foreground">ผู้ตอบ {s.responsesCount} คน · ดาวน์โหลดเป็น CSV ได้</p>
          </div>
          <div className="flex gap-2">
            {s.mode === 'IN_APP' && <Link href={`/surveys/${s.id}/answer`} className={buttonCls('outline', 'sm')}><Eye />ดูตัวอย่างแบบฟอร์ม</Link>}
            <Link href={`/surveys/${s.id}/results`} className={buttonCls('primary', 'sm')}><BarChart3 />ดูผลลัพธ์</Link>
          </div>
        </Card>
      )}

      {s.status !== 'CLOSED' && s.remainingToFund > 0 && !s.hasResponded && <SponsorCard s={s} onDone={done} />}
      {s.isOwner && s.status !== 'CLOSED' && <CloseCard s={s} onDone={done} />}
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
      <form onSubmit={submit} className="space-y-3">
        <h3 className="flex items-center gap-2 font-extrabold"><HandCoins className="size-4 text-primary" />{s.isOwner ? 'เติม Coin รางวัล' : 'ช่วยสนับสนุน'}</h3>
        <p className="text-xs text-muted-foreground">
          {s.isOwner ? 'เพิ่มจำนวนคนที่รับรางวัลได้' : 'ลง Coin เข้ารางวัลของแบบสอบถามนี้ — ผู้สนับสนุนจะตอบแบบสอบถามนี้ไม่ได้'} · ที่เหลือตอนปิดรับคืนตามสัดส่วน
          {s.myContribution > 0 && ` · คุณลงแล้ว ${s.myContribution} Coin`}
        </p>
        <div className="flex gap-2">
          <input type="number" className={inputCls} min={1} max={s.remainingToFund} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          <Button disabled={loading || amount < 1}>ลง Coin</Button>
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
      <Button variant="danger" className="w-full" onClick={close}>ปิดรับแบบสอบถาม</Button>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

/** สุ่มจับรางวัล: รางวัลแต่ละอันดับ + ผลหลังสุ่ม */
function DrawCard({ s }: { s: SurveyDetail }) {
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-extrabold"><Trophy className="size-4 text-warning" />สุ่มจับรางวัล</h3>
        <span className="text-xs text-muted-foreground">{s.drawnAt ? `สุ่มแล้ว ${fmtDate(s.drawnAt)}` : 'สุ่มตอนปิดแบบสอบถาม'}</span>
      </div>
      <ul className="divide-y divide-border rounded-2xl bg-lavender-soft/60 px-3">
        {s.prizes.map((p, i) => {
          const w = s.winners.find((x) => x.rank === i + 1);
          return (
            <li key={i} className="flex items-center justify-between py-2.5 text-sm">
              <span className="font-bold">อันดับ {i + 1}{w && <span className="ml-2 font-normal text-muted-foreground">{w.name ?? 'ผู้ตอบ'}{s.myPrizeRank === i + 1 ? ' (คุณ)' : ''}</span>}</span>
              <span className="flex items-center gap-1 font-extrabold"><Coins className="size-4 text-warning" />{p.toLocaleString()}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">ทุกคนที่ส่งแบบสอบถามมีโอกาสเท่ากัน ไม่ต้องแข่งกันตอบเร็ว · ถ้าผู้ตอบน้อยกว่าจำนวนรางวัล รางวัลที่เหลือคืนผู้ลง Coin</p>
    </Card>
  );
}
