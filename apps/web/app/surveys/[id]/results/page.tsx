'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Download } from 'lucide-react';
import { QUESTION_TYPE_LABEL, type QuestionResult, type SurveyResults } from '@tembo/shared';
import { api } from '@/lib/api';
import { AppShell } from '@/components/shell';
import { Badge, buttonCls, Card, SectionHeader, Spinner } from '@/components/ui';

export default function ResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AppShell><Results id={id} /></AppShell>;
}

function Results({ id }: { id: string }) {
  const [r, setR] = useState<SurveyResults | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<SurveyResults>(`/surveys/${id}/results`).then(setR).catch((e) => setError((e as Error).message)); }, [id]);

  if (error) return <Card className="py-10 text-center text-sm text-muted-foreground">{error}</Card>;
  if (!r) return <Spinner />;

  return (
    <div className="max-w-3xl space-y-4">
      <Link href={`/surveys/${id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" />กลับไปหน้าแบบสอบถาม</Link>
      <SectionHeader
        title={`ผลลัพธ์: ${r.title}`}
        subtitle={`ผู้ตอบทั้งหมด ${r.responses} คน · ไม่แสดงชื่อหรืออีเมลผู้ตอบ`}
        action={<a href={`/api/surveys/${id}/results.csv`} className={buttonCls(r.responses ? 'primary' : 'outline', 'sm')}><Download />ดาวน์โหลด CSV</a>}
      />

      {r.byFaculty.length > 0 && (
        <Card className="space-y-3">
          <h3 className="font-extrabold">ผู้ตอบแยกตามคณะ</h3>
          <Bars rows={r.byFaculty.map((f) => ({ label: f.faculty, count: f.count }))} total={r.responses} />
        </Card>
      )}

      {r.questions.length === 0 && (
        <Card className="text-sm text-muted-foreground">แบบสอบถามนี้ใช้ฟอร์มภายนอก คำตอบอยู่ในฟอร์มของคุณ · ไฟล์ CSV มีรหัสอ้างอิงของผู้ตอบแต่ละคนไว้เทียบกับฟอร์ม</Card>
      )}
      {r.questions.map((q, i) => <QuestionCard key={q.question.id} n={i + 1} q={q} total={r.responses} />)}
    </div>
  );
}

function QuestionCard({ n, q, total }: { n: number; q: QuestionResult; total: number }) {
  return (
    <Card className="space-y-3 p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-medium"><span className="mr-2 text-muted-foreground">{n}.</span>{q.question.title}</h3>
        <Badge tone="outline">{QUESTION_TYPE_LABEL[q.question.type]}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">ตอบ {q.answered}/{total} คน</p>
      {q.kind === 'choice' && <Bars rows={q.question.options.map((o, i) => ({ label: o, count: q.counts[i] }))} total={q.answered} />}
      {q.kind === 'scale' && (
        <>
          <p className="text-sm">ค่าเฉลี่ย <b className="text-lg text-primary">{q.average ?? '–'}</b> / {q.question.scaleMax}</p>
          <Bars rows={q.counts.map((c, i) => ({ label: `${i + 1}${i === 0 && q.question.minLabel ? ` (${q.question.minLabel})` : ''}${i === q.counts.length - 1 && q.question.maxLabel ? ` (${q.question.maxLabel})` : ''}`, count: c }))} total={q.answered} />
        </>
      )}
      {q.kind === 'text' && (q.samples.length
        ? <ul className="max-h-72 space-y-2 overflow-y-auto">{q.samples.map((t, i) => <li key={i} className="rounded-xl bg-muted px-3 py-2 text-sm whitespace-pre-line">{t}</li>)}</ul>
        : <p className="text-sm text-muted-foreground">ยังไม่มีคำตอบ</p>)}
      {q.kind === 'text' && q.answered > q.samples.length && <p className="text-xs text-muted-foreground">แสดง {q.samples.length} คำตอบล่าสุด — ดูทั้งหมดในไฟล์ CSV</p>}
    </Card>
  );
}

function Bars({ rows, total }: { rows: { label: string; count: number }[]; total: number }) {
  return (
    <ul className="space-y-2">
      {rows.map((row) => {
        const pct = total ? Math.round((row.count / total) * 100) : 0;
        return (
          <li key={row.label} className="space-y-1">
            <div className="flex justify-between gap-3 text-sm"><span className="min-w-0 truncate">{row.label}</span><span className="shrink-0 text-muted-foreground">{row.count} · {pct}%</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-primary/15"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
          </li>
        );
      })}
    </ul>
  );
}
