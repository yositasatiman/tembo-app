'use client';
import { FormEvent, use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, BarChart3, CalendarDays, CheckCircle2, Clock3, Coins, Eye, Gift, HandCoins, ListChecks, Lock, Shapes, Trophy, UserCheck, Users } from 'lucide-react';
import { estMinutesLabel, facultyLabel, SURVEY_CATEGORIES, type SurveyDetail } from '@tembo/shared';
import { useT, CoinWord } from '@/lib/i18n';
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
  const { t, p, lang } = useT();
  const [s, setS] = useState<SurveyDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => api<SurveyDetail>(`/surveys/${id}`).then(setS).catch((e) => {
    if (e instanceof ApiError && e.status === 404) setNotFound(true);
  }), [id]);
  useEffect(() => { load(); }, [load]);
  const done = (m: string) => { setMsg(m); load(); reloadMe(); };

  if (notFound) return <Card className="py-10 text-center">{t('Survey not found', 'ไม่พบแบบสอบถาม')}</Card>;
  if (!s) return <Spinner />;

  const pct = s.quota ? Math.round((s.responsesCount / s.quota) * 100) : 0;
  const total = s.targetPool || 1;
  const seg = [
    { v: s.funded.owner, cls: 'bg-primary', label: t('Owner', 'ผู้โพสต์') },
    { v: s.funded.system, cls: 'bg-success', label: t('Subsidy', 'ระบบสมทบ') },
    { v: s.funded.sponsors, cls: 'bg-sky', label: t(`${s.funded.sponsorCount} sponsor(s)`, `เพื่อน ${s.funded.sponsorCount} คน`) },
    { v: s.subsidyStatus === 'PENDING' ? s.subsidyAmount : 0, cls: 'bg-success/40', label: t('Subsidy (pending)', 'สมทบ (รอตรวจ)') },
  ];

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/surveys" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />{t('Back to surveys', 'กลับไปหน้าแบบสอบถาม')}</Link>

      <Card className="space-y-4 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex gap-1.5"><StatusBadge status={s.status} />{s.isOwner && <Badge tone="outline">{t('Yours', 'ของคุณ')}</Badge>}</div>
            <h1 className="text-xl leading-snug font-extrabold">{s.title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{s.ownerName ?? t('Anonymous', 'ไม่ระบุชื่อ')}{s.ownerFaculty && (lang === 'th' ? ` · คณะ${s.ownerFaculty}` : ` · ${p(facultyLabel(s.ownerFaculty))}`)}</p>
          </div>
          <Badge tone="solid" className="px-3 py-1 text-sm">{s.rewardMode === 'DRAW' ? <><Gift />{t(`Win up to ${s.rewardPerResponse} Coin`, `ลุ้นสูงสุด ${s.rewardPerResponse} เหรียญ`)}</> : <><Coins />{t(`${s.rewardPerResponse} Coin / person`, `${s.rewardPerResponse} เหรียญ / คน`)}</>}</Badge>
        </div>
        {s.description && <p className="whitespace-pre-line text-sm leading-relaxed">{s.description}</p>}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium">{t(`${s.responsesCount}/${s.quota} responses`, `ตอบแล้ว ${s.responsesCount}/${s.quota} คน`)}</span>
            <span className="text-muted-foreground">{pct}%</span>
          </div>
          <Progress value={pct} />
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground [&_svg]:size-3.5">
          <span className="flex items-center gap-1.5"><CalendarDays />{t('Closes', 'ปิด')} {fmtDate(s.closesAt)}</span>
          <span className="flex items-center gap-1.5"><ListChecks />{t(`${s.questionCount} questions`, `${s.questionCount} ข้อ`)}</span>
          <span className="flex items-center gap-1.5"><Users />{s.rewardMode === 'DRAW' ? t(`${s.payableResponses} spots left`, `รับอีก ${s.payableResponses} คน`) : t(`${s.payableResponses} rewards left`, `รับรางวัลได้อีก ${s.payableResponses} คน`)}</span>
          {s.category && <span className="flex items-center gap-1.5"><Shapes />{p(SURVEY_CATEGORIES[s.category])}</span>}
          {s.estMinutes && <span className="flex items-center gap-1.5"><Clock3 />{p(estMinutesLabel(s.estMinutes) ?? '')}</span>}
          {(s.eligibleFaculties.length > 0 || s.eligibleYears.length > 0) && (
            <span className="flex items-center gap-1.5"><UserCheck />
              {[s.eligibleFaculties.length ? s.eligibleFaculties.map((f) => p(facultyLabel(f))).join(', ') : null, s.eligibleYears.length ? t(`Year ${s.eligibleYears.join(', ')}`, `ปี ${s.eligibleYears.join(', ')}`) : null].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
      </Card>

      {msg && <Notice tone="success">{msg}</Notice>}

      {s.isOwner && s.status !== 'CLOSED' && s.externalVerify === 'CODE' && <ExternalOwnerSetup s={s} />}
      {s.isOwner && s.status !== 'CLOSED' && s.externalVerify === 'SCRIPT' && <ScriptOwnerSetup s={s} reload={load} />}

      {!s.isOwner && s.externalVerify === 'SCRIPT' && (s.hasResponded || (s.status !== 'CLOSED' && s.canRespond)) && <ScriptRespond s={s} reload={() => { load(); reloadMe(); }} />}

      {!s.isOwner && s.status !== 'CLOSED' && s.externalVerify === 'CODE' && s.canRespond && (
        <ExternalRespond s={s} onDone={(r) => done(t(`Confirmed! You received ${r} Coin`, `ยืนยันการตอบแล้ว ได้รับ ${r} เหรียญ`))} />
      )}

      {s.rewardMode === 'DRAW' && <DrawCard s={s} />}

      {!s.isOwner && s.status !== 'CLOSED' && (s.externalVerify !== 'SCRIPT' ? (s.mode === 'IN_APP' || !s.canRespond) : (!s.canRespond && !s.hasResponded)) && (
        <Card className="space-y-3">
          <h3 className="font-extrabold">{t('Take the survey', 'ตอบแบบสอบถาม')}</h3>
          {s.hasResponded ? <p className="flex items-center gap-2 text-sm text-success"><CheckCircle2 className="size-4" />{t('You have answered', 'คุณตอบแล้ว')}</p>
            : s.canRespond ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">{t(`${s.questionCount} questions · get ${s.rewardPerResponse} Coin instantly when you finish`, `${s.questionCount} ข้อ · ตอบครบรับ ${s.rewardPerResponse} เหรียญทันที`)}</p>
                <Link href={`/surveys/${s.id}/answer`} className={buttonCls('primary')}>{t('Start survey', 'เริ่มทำแบบสอบถาม')}</Link>
              </div>
            )
            : <p className="flex items-center gap-2 text-sm text-muted-foreground"><Lock className="size-4" />{s.respondBlockedReason}</p>}
        </Card>
      )}

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-extrabold">{t('Reward Coin (escrow)', 'เหรียญรางวัลที่พักไว้')}</h3>
          <span className="text-sm text-muted-foreground">{t('Total', 'รวม')} {s.targetPool.toLocaleString()} <CoinWord /></span>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
          {seg.map((x) => x.v > 0 && <div key={x.label} className={x.cls} style={{ width: `${(x.v / total) * 100}%` }} title={`${x.label} ${x.v}`} />)}
        </div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {seg.filter((x) => x.v > 0).map((x) => <li key={x.label} className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${x.cls}`} />{x.label} {x.v}</li>)}
          {s.remainingToFund > 0 && <li className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-muted-foreground/30" />{t('Still needed', 'ยังขาด')} {s.remainingToFund}</li>}
        </ul>
        <p className="text-xs text-muted-foreground">{t(`${s.escrowBalance.toLocaleString()} Coin left in escrow`, `คงเหลือในกองรางวัล ${s.escrowBalance.toLocaleString()} เหรียญ`)}{s.postFee ? t(` · posting fee ${s.postFee} Coin`, ` · ค่าโพสต์ ${s.postFee} เหรียญ`) : t(' · first post free', ' · โพสต์แรกฟรี')}</p>
        {s.subsidyStatus === 'PENDING' && <Notice tone="warning">{t('Waiting for an admin to review your subsidy request. Responses are paused until then, but friends can still sponsor.', 'รอแอดมินตรวจการขอระบบสมทบ — ระหว่างนี้ยังไม่รับคำตอบ แต่เพื่อนช่วยสนับสนุนได้')}</Notice>}
        {s.subsidyStatus === 'REJECTED' && s.subsidyNote && <Notice>{t('Subsidy not approved', 'ไม่ได้รับการสมทบ')}: {s.subsidyNote}</Notice>}
      </Card>

      {s.isOwner && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold">{t('Results', 'ผลลัพธ์')}</h3>
            <p className="text-sm text-muted-foreground">{t(`${s.responsesCount} responses · download as CSV`, `ผู้ตอบ ${s.responsesCount} คน · ดาวน์โหลดเป็น CSV ได้`)}</p>
          </div>
          <div className="flex gap-2">
            {s.mode === 'IN_APP' && <Link href={`/surveys/${s.id}/answer`} className={buttonCls('outline', 'sm')}><Eye />{t('Preview form', 'ดูตัวอย่างแบบฟอร์ม')}</Link>}
            <Link href={`/surveys/${s.id}/results`} className={buttonCls('primary', 'sm')}><BarChart3 />{t('View results', 'ดูผลลัพธ์')}</Link>
          </div>
        </Card>
      )}

      {s.status !== 'CLOSED' && s.remainingToFund > 0 && !s.hasResponded && <SponsorCard s={s} onDone={done} />}
      {s.isOwner && s.status !== 'CLOSED' && <CloseCard s={s} onDone={done} />}
    </div>
  );
}

function SponsorCard({ s, onDone }: { s: SurveyDetail; onDone: (m: string) => void }) {
  const { t } = useT();
  const [amount, setAmount] = useState(Math.min(50, s.remainingToFund));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try { await post(`/surveys/${s.id}/sponsor`, { amount }); onDone(s.isOwner ? t(`Added ${amount} Coin`, `เติม ${amount} เหรียญแล้ว`) : t(`Sponsored ${amount} Coin`, `สนับสนุน ${amount} เหรียญแล้ว`)); }
    catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }
  return (
    <Card>
      <form onSubmit={submit} className="space-y-3">
        <h3 className="flex items-center gap-2 font-extrabold"><HandCoins className="size-4 text-primary" />{s.isOwner ? t('Add reward Coin', 'เติมเหรียญรางวัล') : t('Sponsor this survey', 'ช่วยสนับสนุน')}</h3>
        <p className="text-xs text-muted-foreground">
          {s.isOwner ? t('Let more people earn the reward', 'เพิ่มจำนวนคนที่รับรางวัลได้') : t('Add Coin to this survey’s rewards. Sponsors cannot answer it.', 'ลงเหรียญเข้ารางวัลของแบบสอบถามนี้ — ผู้สนับสนุนจะตอบแบบสอบถามนี้ไม่ได้')} · {t('leftovers are refunded proportionally when it closes', 'ที่เหลือตอนปิดรับคืนตามสัดส่วน')}
          {s.myContribution > 0 && t(` · you have put in ${s.myContribution} Coin`, ` · คุณลงแล้ว ${s.myContribution} เหรียญ`)}
        </p>
        <div className="flex gap-2">
          <input type="number" className={inputCls} min={1} max={s.remainingToFund} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          <Button disabled={loading || amount < 1}>{t('Add Coin', 'ลงเหรียญ')}</Button>
        </div>
        <ErrorText>{error}</ErrorText>
      </form>
    </Card>
  );
}

function CloseCard({ s, onDone }: { s: SurveyDetail; onDone: (m: string) => void }) {
  const { t } = useT();
  const [error, setError] = useState('');
  async function close() {
    if (!window.confirm(t('Close this survey? Leftover Coin is refunded proportionally right away, and it cannot be reopened.', 'ปิดรับแบบสอบถามนี้? เหรียญที่เหลือจะคืนตามสัดส่วนทันที และเปิดใหม่ไม่ได้'))) return;
    setError('');
    try { await post(`/surveys/${s.id}/close`); onDone(t('Survey closed. Leftover Coin refunded.', 'ปิดรับแล้ว คืนเหรียญที่เหลือเรียบร้อย')); }
    catch (e) { setError((e as Error).message); }
  }
  return (
    <Card className="space-y-2">
      <Button variant="danger" className="w-full" onClick={close}>{t('Close survey', 'ปิดรับแบบสอบถาม')}</Button>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

/** สุ่มจับรางวัล: รางวัลแต่ละอันดับ + ผลหลังสุ่ม */
function DrawCard({ s }: { s: SurveyDetail }) {
  const { t } = useT();
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-extrabold"><Trophy className="size-4 text-warning" />{t('Lucky draw', 'สุ่มจับรางวัล')}</h3>
        <span className="text-xs text-muted-foreground">{s.drawnAt ? t(`Drawn ${fmtDate(s.drawnAt)}`, `สุ่มแล้ว ${fmtDate(s.drawnAt)}`) : t('Drawn when the survey closes', 'สุ่มตอนปิดแบบสอบถาม')}</span>
      </div>
      <ul className="divide-y divide-border rounded-2xl bg-lavender-soft/60 px-3">
        {s.prizes.map((p, i) => {
          const w = s.winners.find((x) => x.rank === i + 1);
          return (
            <li key={i} className="flex items-center justify-between py-2.5 text-sm">
              <span className="font-bold">{t(`Prize #${i + 1}`, `อันดับ ${i + 1}`)}{w && <span className="ml-2 font-normal text-muted-foreground">{w.name ?? t('Participant', 'ผู้ตอบ')}{s.myPrizeRank === i + 1 ? t(' (you)', ' (คุณ)') : ''}</span>}</span>
              <span className="flex items-center gap-1 font-extrabold"><Coins className="size-4 text-warning" />{p.toLocaleString()}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">{t('Everyone who submits has the same chance, so there is no need to rush. If there are fewer participants than prizes, the rest goes back to whoever funded it.', 'ทุกคนที่ส่งแบบสอบถามมีโอกาสเท่ากัน ไม่ต้องแข่งกันตอบเร็ว · ถ้าผู้ตอบน้อยกว่าจำนวนรางวัล รางวัลที่เหลือคืนผู้ลงเหรียญ')}</p>
    </Card>
  );
}
