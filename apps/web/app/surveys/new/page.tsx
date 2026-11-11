'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { quoteSurvey, SURVEY_RULES, surveyBand, type MeResponse, type SurveyDetail, type SurveyQuoteResponse } from '@tembo/shared';
import { api, getMe, post } from '@/lib/api';
import { Button, Card, ErrorText, Field, inputCls, TopBar } from '@/components/ui';

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function NewSurveyPage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [info, setInfo] = useState<SurveyQuoteResponse | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questionCount, setQuestionCount] = useState(10);
  const [reward, setReward] = useState(5);
  const [quota, setQuota] = useState(30);
  const [closesAt, setClosesAt] = useState(() => toLocalInput(new Date(Date.now() + 14 * 86_400_000)));
  const [requestSubsidy, setRequestSubsidy] = useState(false);
  const [contribution, setContribution] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([getMe(), api<SurveyQuoteResponse>('/surveys/quote')])
      .then(([m, q]) => { setMe(m); setInfo(q); })
      .catch(() => router.replace('/login'));
  }, [router]);

  const band = surveyBand(questionCount);
  const q = useMemo(() => info && quoteSurvey({
    questionCount, rewardPerResponse: reward, quota, isFirstPost: info.isFirstPost, withSubsidy: requestSubsidy,
  }), [info, questionCount, reward, quota, requestSubsidy]);

  // ค่าเริ่มต้น: ลงเต็มเท่าที่มี Coin
  const balance = me?.balance ?? 0;
  const autoContribution = q ? Math.max(0, Math.min(q.maxOwnerContribution, balance - q.postFee)) : 0;
  const ownerContribution = contribution === '' ? autoContribution : contribution;
  const totalPay = (q?.postFee ?? 0) + ownerContribution;
  const leftForFriends = q ? Math.max(0, q.maxOwnerContribution - ownerContribution) : 0;

  function onQuestions(n: number) {
    setQuestionCount(n);
    const b = surveyBand(n);
    if (b) setReward(b.suggestedReward);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const s = await post<SurveyDetail>('/surveys', {
        title, description: description || undefined, questionCount, rewardPerResponse: reward, quota,
        closesAt: new Date(closesAt).toISOString(), ownerContribution, requestSubsidy,
      });
      router.replace(`/surveys/${s.id}`);
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  if (!me || !info) return <p className="pt-32 text-center text-slate-500">กำลังโหลด…</p>;

  return (
    <div className="space-y-4">
      <TopBar />
      <form onSubmit={submit} className="space-y-4">
        <Card className="space-y-4">
          <h2 className="text-xl font-bold">โพสต์แบบสอบถามงานวิจัย</h2>
          <Field label="ชื่อแบบสอบถาม"><input className={inputCls} required minLength={3} maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="รายละเอียด (ไม่บังคับ)">
            <textarea className={inputCls} rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ใครควรตอบ ใช้เวลากี่นาที ข้อมูลจะถูกใช้อย่างไร" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="จำนวนข้อ" hint={`สูงสุด ${SURVEY_RULES.MAX_QUESTIONS} ข้อ`}>
              <input type="number" className={inputCls} min={1} max={SURVEY_RULES.MAX_QUESTIONS} required value={questionCount} onChange={(e) => onQuestions(Number(e.target.value))} />
            </Field>
            <Field label="รางวัล/คน (Coin)" hint={band ? `ขั้นต่ำ ${band.minReward} · แนะนำ ${band.suggestedReward}` : undefined}>
              <input type="number" className={inputCls} min={band?.minReward ?? 1} max={SURVEY_RULES.MAX_REWARD} required value={reward} onChange={(e) => setReward(Number(e.target.value))} />
            </Field>
            <Field label="ต้องการผู้ตอบ (คน)">
              <input type="number" className={inputCls} min={1} max={SURVEY_RULES.MAX_QUOTA} required value={quota} onChange={(e) => setQuota(Number(e.target.value))} />
            </Field>
            <Field label="ปิดรับ">
              <input type="datetime-local" className={inputCls} required value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-3">
          <h3 className="font-bold">Coin</h3>
          <label className={`flex gap-3 rounded-xl border p-3 ${info.subsidy.eligible ? 'border-brand-100' : 'border-slate-200 opacity-60'}`}>
            <input type="checkbox" className="mt-1" disabled={!info.subsidy.eligible} checked={requestSubsidy} onChange={(e) => { setRequestSubsidy(e.target.checked); setContribution(''); }} />
            <span className="text-sm">
              <b>ขอระบบสมทบช่วงเปิดตัว</b> — TEMBO ช่วยครึ่งหนึ่งของยอดรางวัล สูงสุด {SURVEY_RULES.SUBSIDY_MAX_AMOUNT} Coin (เหลือ {info.subsidy.remainingSlots} สิทธิ์)
              <span className="block text-xs text-slate-500">{info.subsidy.reason ?? 'แอดมินต้องตรวจก่อนว่าเป็นงานวิจัยจริง ระหว่างนั้นยังไม่รับคำตอบ'}</span>
            </span>
          </label>
          {q && (
            <>
              <dl className="space-y-1 rounded-xl bg-brand-50 p-3 text-sm">
                <Row k={`ยอดรางวัลรวม (${reward} × ${quota} คน)`} v={q.targetPool} />
                {q.subsidyAmount > 0 && <Row k="ระบบสมทบ (เมื่ออนุมัติ)" v={-q.subsidyAmount} />}
                <Row k="ค่าโพสต์" v={q.postFee} note={info.isFirstPost ? 'โพสต์แรกฟรี' : undefined} />
              </dl>
              <Field label="คุณลง Coin เอง" hint={`ลงได้ ${q.minOwnerContribution}–${q.maxOwnerContribution} · ส่วนที่ขาดให้เพื่อนช่วยสนับสนุนได้`}>
                <input type="number" className={inputCls} min={q.minOwnerContribution} max={q.maxOwnerContribution} value={ownerContribution} onChange={(e) => setContribution(e.target.value === '' ? '' : Number(e.target.value))} />
              </Field>
              <dl className="space-y-1 text-sm">
                <Row k="ตัดจากกระเป๋าตอนนี้" v={totalPay} bold />
                <Row k="คงเหลือหลังโพสต์" v={balance - totalPay} />
                <Row k="รอเพื่อนสนับสนุน" v={leftForFriends} />
              </dl>
              {balance < totalPay && <ErrorText>Coin ไม่พอ (มี {balance})</ErrorText>}
            </>
          )}
        </Card>
        <ErrorText>{error}</ErrorText>
        <Button disabled={loading || !q || balance < totalPay}>{loading ? 'กำลังโพสต์…' : `โพสต์ (ใช้ ${totalPay} Coin)`}</Button>
        <p className="text-center text-xs text-slate-500">Coin ที่เหลือตอนปิดรับจะคืนตามสัดส่วนให้ทุกคนที่ลง · ค่าโพสต์ไม่คืน</p>
      </form>
    </div>
  );
}

function Row({ k, v, note, bold }: { k: string; v: number; note?: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold' : ''}`}>
      <dt>{k}{note && <span className="ml-1 rounded bg-emerald-100 px-1.5 text-xs text-emerald-700">{note}</span>}</dt>
      <dd>{v.toLocaleString()}</dd>
    </div>
  );
}
