'use client';
import { FormEvent, use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Coins, Eye } from 'lucide-react';
import { validateAnswers, type Answers, type AnswerValue, type SurveyForm } from '@tembo/shared';
import { api, ApiError, post } from '@/lib/api';
import { AppShell, useMe } from '@/components/shell';
import { AnswerField } from '@/components/survey/answer-field';
import { Badge, Button, buttonCls, Card, ErrorText, Notice, Progress, Spinner } from '@/components/ui';

export default function AnswerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AppShell><AnswerForm id={id} /></AppShell>;
}

function AnswerForm({ id }: { id: string }) {
  const router = useRouter();
  const { me, reload } = useMe();
  const [form, setForm] = useState<SurveyForm | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<{ reward: number; balance: number } | null>(null);

  useEffect(() => {
    Promise.all([api<SurveyForm>(`/surveys/${id}/form`), api<{ isOwner: boolean }>(`/surveys/${id}`)])
      .then(([f, d]) => { setForm(f); setIsOwner(d.isOwner); })
      .catch((e) => setLoadError((e as Error).message));
  }, [id]);

  if (loadError) return <div className="max-w-3xl space-y-4"><Back id={id} /><Card className="py-10 text-center text-sm text-muted-foreground">{loadError}</Card></div>;
  if (!form) return <Spinner />;

  const required = form.questions.filter((q) => q.required);
  const answeredRequired = required.filter((q) => answers[q.id] !== undefined).length;
  const pct = required.length ? (answeredRequired / required.length) * 100 : 100;

  const set = (qid: string, v: AnswerValue | undefined) => {
    setAnswers((a) => {
      const next = { ...a };
      if (v === undefined) delete next[qid]; else next[qid] = v;
      return next;
    });
    setErrors((e) => { const n = { ...e }; delete n[qid]; return n; });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form || isOwner) return;
    const check = validateAnswers(form.questions, answers);
    if (!check.ok) {
      setErrors(check.errors);
      document.getElementById(`q-${Object.keys(check.errors)[0]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setError(''); setLoading(true);
    try {
      const r = await post<{ reward: number; balance: number }>(`/surveys/${id}/responses`, { answers });
      setDone(r);
      reload();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors);
      setError((err as Error).message);
    } finally { setLoading(false); }
  }

  if (done) {
    return (
      <div className="max-w-3xl">
        <Card className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success"><CheckCircle2 className="size-8" /></span>
          <h1 className="font-display text-xl font-semibold">ขอบคุณที่ช่วยงานวิจัย!</h1>
          <p className="flex items-center gap-1.5 text-sm"><Coins className="size-4 text-primary" />ได้รับ <b>{done.reward} Coin</b> · คงเหลือ {done.balance.toLocaleString()} Coin</p>
          <div className="mt-2 flex gap-2">
            <Link href="/surveys" className={buttonCls('primary', 'sm')}>ทำแบบสอบถามอื่นต่อ</Link>
            <Link href={`/surveys/${id}`} className={buttonCls('outline', 'sm')}>กลับไปหน้าแบบสอบถาม</Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-4">
      <Back id={id} />
      <Card className="space-y-3 p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-display text-xl leading-snug font-semibold">{form.title}</h1>
          <Badge tone="solid" className="px-3 py-1 text-sm"><Coins />{form.rewardPerResponse} Coin</Badge>
        </div>
        {form.description && <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{form.description}</p>}
        {isOwner
          ? <Notice tone="warning"><Eye className="mr-1 inline size-4" />ตัวอย่างสำหรับผู้โพสต์ — ส่งคำตอบไม่ได้</Notice>
          : <p className="text-xs text-muted-foreground">ผู้โพสต์จะเห็นคำตอบพร้อมคณะและชั้นปีของคุณ แต่ไม่เห็นชื่อหรืออีเมล · {me.displayName}</p>}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground"><span>ข้อบังคับที่ตอบแล้ว {answeredRequired}/{required.length}</span><span>{form.questions.length} ข้อ</span></div>
          <Progress value={pct} />
        </div>
      </Card>

      {form.questions.map((q, i) => (
        <Card key={q.id} id={`q-${q.id}`} className={errors[q.id] ? 'border-destructive/50 p-6' : 'p-6'}>
          <fieldset className="space-y-3">
            <legend className="font-medium">
              <span className="mr-2 text-muted-foreground">{i + 1}.</span>{q.title}
              {q.required ? <span className="ml-1 text-destructive">*</span> : <span className="ml-2 text-xs text-muted-foreground">(ไม่บังคับ)</span>}
            </legend>
            <AnswerField q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} disabled={isOwner} />
            {errors[q.id] && <p className="text-sm text-destructive">{errors[q.id]}</p>}
          </fieldset>
        </Card>
      ))}

      <ErrorText>{error}</ErrorText>
      {!isOwner && (
        <Button className="w-full" disabled={loading}>{loading ? 'กำลังส่ง…' : `ส่งคำตอบ รับ ${form.rewardPerResponse} Coin`}</Button>
      )}
      {isOwner && <Button type="button" variant="outline" className="w-full" onClick={() => router.push(`/surveys/${id}/results`)}>ไปหน้าผลลัพธ์</Button>}
    </form>
  );
}

function Back({ id }: { id: string }) {
  return <Link href={`/surveys/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />กลับไปหน้าแบบสอบถาม</Link>;
}
