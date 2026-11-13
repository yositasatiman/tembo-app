'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import type { SurveySummary } from '@tembo/shared';
import { api } from '@/lib/api';
import { AppShell, FeedTabs, PageHeading } from '@/components/shell';
import { SurveyCard } from '@/components/survey/card';
import { Chip, EmptyState, Spinner, Toast } from '@/components/ui';

const FILTERS = [
  { key: 'all', label: 'ทั้งหมด' },
  { key: 'short', label: 'ไม่เกิน 10 ข้อ' },
  { key: 'reward', label: 'รางวัลสูง' },
  { key: 'saved', label: 'บันทึกไว้' },
  { key: 'mine', label: 'แบบสอบถามของฉัน' },
] as const;
type Filter = (typeof FILTERS)[number]['key'];

export default function SurveysPage() {
  return <AppShell><Suspense fallback={<Spinner />}><Surveys /></Suspense></AppShell>;
}

/** Figma: SURVEY / discovery */
function Surveys() {
  const router = useRouter();
  const params = useSearchParams();
  const raw = params.get('tab') ?? 'all';
  const filter: Filter = FILTERS.some((f) => f.key === raw) ? (raw as Filter) : 'all';
  const [rows, setRows] = useState<SurveySummary[] | null>(null);
  const [toast, setToast] = useState('');
  const mine = filter === 'mine';
  const source = mine ? '/surveys/mine' : filter === 'saved' ? '/surveys/saved' : '/surveys';

  useEffect(() => {
    setRows(null);
    api<SurveySummary[]>(source).then(setRows).catch(() => setRows([]));
  }, [source]);

  const list = useMemo(() => {
    if (!rows) return null;
    if (filter === 'short') return rows.filter((s) => s.questionCount <= 10);
    if (filter === 'reward') return [...rows].sort((a, b) => b.rewardPerResponse - a.rewardPerResponse);
    if (filter === 'all') return [...rows].sort((a, b) => Number(a.responded) - Number(b.responded));
    return rows;
  }, [rows, filter]);

  return (
    <div className="space-y-3">
      <PageHeading title="แบบสอบถาม" subtitle="แบ่งปันความคิดเห็นแล้วรับ Coin" create={{ href: '/surveys/new', label: 'สร้าง' }} />
      <FeedTabs active="survey" />
      <div role="tablist" aria-label="ตัวกรอง" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
        {FILTERS.map((f) => <Chip key={f.key} active={filter === f.key} onClick={() => router.replace(f.key === 'all' ? '/surveys' : `/surveys?tab=${f.key}`)}>{f.label}</Chip>)}
      </div>
      {list === null ? <Spinner />
        : list.length === 0 ? (
          <EmptyState icon={<ClipboardList />} title={mine ? 'คุณยังไม่ได้โพสต์แบบสอบถาม' : filter === 'saved' ? 'ยังไม่ได้บันทึกแบบสอบถาม' : 'ยังไม่มีแบบสอบถามที่เปิดรับ'}
            text={mine ? 'โพสต์แบบสอบถามงานวิจัย แล้วให้ Coin เป็นรางวัลกับผู้ตอบ' : 'เป็นคนแรกที่โพสต์เลย'}
            action={<Link href="/surveys/new" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">โพสต์แบบสอบถาม</Link>} />
        ) : <div className="space-y-2.5">{list.map((s) => <SurveyCard key={s.id} s={s} onToast={setToast} />)}</div>}
      {toast && <Toast onClose={() => setToast('')}>{toast}</Toast>}
    </div>
  );
}
