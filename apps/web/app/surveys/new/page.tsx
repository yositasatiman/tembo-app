'use client';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { quoteSurvey, SURVEY_RULES, surveyBand, type QuestionInput, type SurveyDetail, type SurveyQuoteResponse } from '@tembo/shared';
import { newQuestion, QuestionBuilder } from '@/components/survey/builder';
import { api, post } from '@/lib/api';
import { AppShell, useMe } from '@/components/shell';
import { Button, Card, ErrorText, Field, inputCls, Spinner } from '@/components/ui';

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function NewSurveyPage() {
  return <AppShell><NewSurvey /></AppShell>;
}

function NewSurvey() {
  const router = useRouter();
  const { me } = useMe();
  const [info, setInfo] = useState<SurveyQuoteResponse | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<QuestionInput[]>(() => [newQuestion()]);
  const questionCount = questions.length;
  const [reward, setReward] = useState(5);
  const [rewardTouched, setRewardTouched] = useState(false);
  const [quota, setQuota] = useState(30);
  const [closesAt, setClosesAt] = useState(() => toLocalInput(new Date(Date.now() + 14 * 86_400_000)));
  const [requestSubsidy, setRequestSubsidy] = useState(false);
  const [contribution, setContribution] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api<SurveyQuoteResponse>('/surveys/quote').then(setInfo).catch(() => undefined);
  }, []);

  const band = surveyBand(questionCount);
  const q = useMemo(() => info && quoteSurvey({
    questionCount, rewardPerResponse: reward, quota, isFirstPost: info.isFirstPost, withSubsidy: requestSubsidy,
  }), [info, questionCount, reward, quota, requestSubsidy]);

  // ค่าเริ่มต้น: ลงเต็มเท่าที่มี Coin
  const balance = me.balance;
  const autoContribution = q ? Math.max(0, Math.min(q.maxOwnerContribution, balance - q.postFee)) : 0;
  const ownerContribution = contribution === '' ? autoContribution : contribution;
  const totalPay = (q?.postFee ?? 0) + ownerContribution;
  const leftForFriends = q ? Math.max(0, q.maxOwnerContribution - ownerContribution) : 0;

  // ปรับรางวัลแนะนำตามจำนวนข้อ จนกว่าผู้ใช้จะแก้เอง
  useEffect(() => {
    const b = surveyBand(questionCount);
    if (b && !rewardTouched) setReward(b.suggestedReward);
    else if (b && reward < b.minReward) setReward(b.minReward);
  }, [questionCount]); // eslint-disable-line react-hooks/exhaustive-deps


  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const s = await post<SurveyDetail>('/surveys', {
        title, description: description || undefined, questions, rewardPerResponse: reward, quota,
        closesAt: new Date(closesAt).toISOString(), ownerContribution, requestSubsidy,
      });
      router.replace(`/surveys/${s.id}`);
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  if (!info) return <Spinner />;

  return (
    <div className="max-w-3xl">
      <form onSubmit={submit} className="space-y-4">
        <Card className="space-y-4 p-6">
          <div><h1 className="font-display text-xl font-semibold">โพสต์แบบสอบถามงานวิจัย</h1><p className="text-sm text-muted-foreground">รางวัล Coin จะถูกล็อกไว้ใน Escrow และจ่ายให้ผู้ตอบแต่ละคนอัตโนมัติ</p></div>
          <Field label="ชื่อแบบสอบถาม"><input className={inputCls} required minLength={3} maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <Field label="รายละเอียด (ไม่บังคับ)">
            <textarea className={inputCls} rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="ใครควรตอบ ใช้เวลากี่นาที ข้อมูลจะถูกใช้อย่างไร" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="รางวัล/คน (Coin)" hint={band ? `${questionCount} ข้อ · ขั้นต่ำ ${band.minReward} · แนะนำ ${band.suggestedReward}` : undefined}>
              <input type="number" className={inputCls} min={band?.minReward ?? 1} max={SURVEY_RULES.MAX_REWARD} required value={reward} onChange={(e) => { setRewardTouched(true); setReward(Number(e.target.value)); }} />
            </Field>
            <Field label="ต้องการผู้ตอบ (คน)">
              <input type="number" className={inputCls} min={1} max={SURVEY_RULES.MAX_QUOTA} required value={quota} onChange={(e) => setQuota(Number(e.target.value))} />
            </Field>
            <Field label="ปิดรับ">
              <input type="datetime-local" className={inputCls} required value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-4 p-6">
          <div>
            <h3 className="font-display font-semibold">คำถาม ({questionCount}/{SURVEY_RULES.MAX_QUESTIONS})</h3>
            <p className="text-sm text-muted-foreground">จำนวนข้อมีผลกับรางวัลขั้นต่ำและค่าโพสต์</p>
          </div>
          <QuestionBuilder value={questions} onChange={setQuestions} />
        </Card>

        <Card className="space-y-4 p-6">
          <h3 className="font-display font-semibold">Coin</h3>
          <label className={`flex gap-3 rounded-2xl border p-4 ${info.subsidy.eligible ? 'border-primary/30 bg-primary-soft/40' : 'border-border opacity-60'}`}>
            <input type="checkbox" className="mt-1 accent-primary" disabled={!info.subsidy.eligible} checked={requestSubsidy} onChange={(e) => { setRequestSubsidy(e.target.checked); setContribution(''); }} />
            <span className="text-sm">
              <b>ขอระบบสมทบช่วงเปิดตัว</b> — TEMBO ช่วยครึ่งหนึ่งของยอดรางวัล สูงสุด {SURVEY_RULES.SUBSIDY_MAX_AMOUNT} Coin (เหลือ {info.subsidy.remainingSlots} สิทธิ์)
              <span className="mt-0.5 block text-xs text-muted-foreground">{info.subsidy.reason ?? 'แอดมินต้องตรวจก่อนว่าเป็นงานวิจัยจริง ระหว่างนั้นยังไม่รับคำตอบ'}</span>
            </span>
          </label>
          {q && (
            <>
              <dl className="space-y-1.5 rounded-2xl bg-muted p-4 text-sm">
                <Row k={`ยอดรางวัลรวม (${reward} × ${quota} คน)`} v={q.targetPool} />
                {q.subsidyAmount > 0 && <Row k="ระบบสมทบ (เมื่ออนุมัติ)" v={-q.subsidyAmount} />}
                <Row k="ค่าโพสต์" v={q.postFee} note={info.isFirstPost ? 'โพสต์แรกฟรี' : undefined} />
              </dl>
              <Field label="คุณลง Coin เอง" hint={`ลงได้ ${q.minOwnerContribution}–${q.maxOwnerContribution} · ส่วนที่ขาดให้เพื่อนช่วยสนับสนุนได้`}>
                <input type="number" className={inputCls} min={q.minOwnerContribution} max={q.maxOwnerContribution} value={ownerContribution} onChange={(e) => setContribution(e.target.value === '' ? '' : Number(e.target.value))} />
              </Field>
              <dl className="space-y-1.5 border-t border-border pt-3 text-sm">
                <Row k="ตัดจากกระเป๋าตอนนี้" v={totalPay} bold />
                <Row k="คงเหลือหลังโพสต์" v={balance - totalPay} />
                <Row k="รอเพื่อนสนับสนุน" v={leftForFriends} />
              </dl>
              {balance < totalPay && <ErrorText>Coin ไม่พอ (มี {balance})</ErrorText>}
            </>
          )}
        </Card>
        <ErrorText>{error}</ErrorText>
        <Button className="w-full" disabled={loading || !q || balance < totalPay}>{loading ? 'กำลังโพสต์…' : `โพสต์ (ใช้ ${totalPay} Coin)`}</Button>
        <p className="text-center text-xs text-muted-foreground">Coin ที่เหลือตอนปิดรับจะคืนตามสัดส่วนให้ทุกคนที่ลง · ค่าโพสต์ไม่คืน</p>
      </form>
    </div>
  );
}

function Row({ k, v, note, bold }: { k: string; v: number; note?: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-bold' : ''}`}>
      <dt>{k}{note && <span className="ml-1.5 rounded-full bg-success-soft px-2 py-0.5 text-xs font-medium text-success">{note}</span>}</dt>
      <dd>{v.toLocaleString()}</dd>
    </div>
  );
}
