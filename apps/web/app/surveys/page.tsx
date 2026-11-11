'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CalendarDays, Plus, Sparkles } from 'lucide-react';
import type { SurveySummary } from '@tembo/shared';
import { api } from '@/lib/api';
import { AppShell, useMe } from '@/components/shell';
import { SurveyCard } from '@/components/survey/card';
import { buttonCls, Card, SectionHeader, Spinner } from '@/components/ui';

export default function SurveysPage() {
  return <AppShell><Suspense fallback={<Spinner />}><Feed /></Suspense></AppShell>;
}

function Feed() {
  const { me } = useMe();
  const params = useSearchParams();
  const tab = params.get('tab') === 'mine' ? 'mine' : 'open';
  const q = (params.get('q') ?? '').trim().toLowerCase();
  const [rows, setRows] = useState<SurveySummary[] | null>(null);

  useEffect(() => {
    setRows(null);
    api<SurveySummary[]>(tab === 'mine' ? '/surveys/mine' : '/surveys').then(setRows).catch(() => setRows([]));
  }, [tab]);

  const list = useMemo(() => {
    if (!rows) return null;
    const filtered = q ? rows.filter((s) => `${s.title} ${s.ownerName ?? ''} ${s.ownerFaculty ?? ''}`.toLowerCase().includes(q)) : rows;
    if (tab === 'mine') return filtered;
    // คณะเดียวกันขึ้นก่อน แล้วตามด้วยใกล้ปิดก่อน (การจับคู่เต็มรูปแบบมาในขั้นที่ 5)
    return [...filtered].sort((a, b) =>
      Number(b.ownerFaculty === me.faculty) - Number(a.ownerFaculty === me.faculty) || a.closesAt.localeCompare(b.closesAt));
  }, [rows, q, tab, me.faculty]);

  const sameFaculty = rows?.filter((s) => s.ownerFaculty === me.faculty).length ?? 0;

  return (
    <>
      {tab === 'open' && !q && (
        <div className="relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-float">
          <div aria-hidden className="absolute -top-16 -right-10 size-56 rounded-full bg-primary-foreground/10" />
          <div aria-hidden className="absolute right-24 -bottom-20 size-40 rounded-full bg-primary-foreground/5" />
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-medium tracking-wide opacity-80"><Sparkles className="size-4" />แนะนำสำหรับคุณ</p>
              <h1 className="mt-2 font-display text-xl leading-snug font-semibold sm:text-2xl">
                {rows ? `${rows.length} แบบสอบถามเปิดรับอยู่` : 'กำลังหาแบบสอบถาม…'}
                {sameFaculty > 0 && ` · ${sameFaculty} จากคณะ${me.faculty}`}
              </h1>
              <p className="mt-1 max-w-xl text-sm opacity-85">
                เรียงจากคณะเดียวกับคุณก่อน แล้วตามด้วยแบบสอบถามที่ใกล้ปิดรับ · ความสนใจของคุณ: {me.interests.join(', ')}
              </p>
            </div>
            <Link href="/onboarding" className="flex items-center gap-2 rounded-xl bg-primary-foreground/15 px-4 py-2.5 text-sm font-medium backdrop-blur transition-colors hover:bg-primary-foreground/25">
              ปรับความสนใจ<ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      )}

      <section className="space-y-4">
        <SectionHeader
          title={tab === 'mine' ? 'แบบสอบถามของฉัน' : q ? `ผลการค้นหา “${params.get('q')}”` : 'แบบสอบถามงานวิจัย'}
          subtitle={tab === 'mine' ? 'ติดตามจำนวนผู้ตอบและ Coin ที่เหลือใน Escrow' : 'งานวิจัยของชาว มช. รางวัล Coin ถูกล็อกไว้ใน Escrow ก่อนเปิดรับ'}
          action={<Link href="/surveys/new" className={buttonCls('outline', 'sm')}><Plus />โพสต์แบบสอบถาม</Link>}
        />
        {list === null ? <Spinner />
          : list.length === 0 ? (
            <Card className="py-10 text-center text-sm text-muted-foreground">
              {tab === 'mine' ? 'คุณยังไม่ได้โพสต์แบบสอบถาม' : q ? 'ไม่พบแบบสอบถามที่ตรงกับคำค้น' : 'ยังไม่มีแบบสอบถามที่เปิดรับ — เป็นคนแรกที่โพสต์เลย'}
            </Card>
          ) : list.map((s) => <SurveyCard key={s.id} s={s} myFaculty={me.faculty} mine={tab === 'mine'} />)}
      </section>

      {tab === 'open' && !q && (
        <section className="space-y-4">
          <SectionHeader title="Event ในมหาวิทยาลัย" subtitle="งานคณะ กิจกรรมชมรม และเวิร์กช็อปรอบ มช." />
          <Card className="flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground"><CalendarDays className="size-6" /></span>
            <div>
              <p className="font-display font-semibold">เร็ว ๆ นี้</p>
              <p className="text-sm text-muted-foreground">ระบบ Event และเช็กอินด้วย QR จะมาในขั้นที่ 4</p>
            </div>
          </Card>
        </section>
      )}
    </>
  );
}
