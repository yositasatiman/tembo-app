'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ClipboardList, FilePen, Trash2 } from 'lucide-react';
import type { DraftSummary, SurveySummary } from '@tembo/shared';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { AppShell, FeedTabs, PageHeading } from '@/components/shell';
import { SurveyCard } from '@/components/survey/card';
import { buttonCls, Chip, EmptyState, fmtDate, Progress, Spinner, Toast } from '@/components/ui';

const FILTERS = [
  { key: 'all', en: 'All', th: 'ทั้งหมด' },
  { key: 'short', en: 'Short', th: 'ไม่เกิน 10 ข้อ' },
  { key: 'reward', en: 'Reward', th: 'รางวัลสูง' },
  { key: 'saved', en: 'Saved', th: 'บันทึกไว้' },
  { key: 'mine', en: 'My Survey', th: 'แบบสอบถามของฉัน' },
] as const;
type Filter = (typeof FILTERS)[number]['key'];

export default function SurveysPage() {
  return <AppShell><Suspense fallback={<Spinner />}><Surveys /></Suspense></AppShell>;
}

/** Figma: SURVEY / discovery */
function Surveys() {
  const router = useRouter();
  const { t } = useT();
  const params = useSearchParams();
  const raw = params.get('tab') ?? params.get('filter') ?? 'all';
  const filter: Filter = FILTERS.some((f) => f.key === raw) ? (raw as Filter) : 'all';
  const [rows, setRows] = useState<SurveySummary[] | null>(null);
  const [toast, setToast] = useState('');
  const mine = filter === 'mine';
  const source = mine ? '/surveys/mine' : filter === 'saved' ? '/surveys/saved' : '/surveys';

  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  useEffect(() => {
    setRows(null);
    api<SurveySummary[]>(source).then(setRows).catch(() => setRows([]));
    if (mine) api<DraftSummary[]>('/survey-drafts').then(setDrafts).catch(() => setDrafts([]));
  }, [source, mine]);

  async function removeDraft(d: DraftSummary) {
    if (!window.confirm(t(`Delete the draft “${d.title || 'Untitled'}”?`, `ลบฉบับร่าง “${d.title || 'ไม่มีชื่อ'}”?`))) return;
    await api(`/survey-drafts/${d.id}`, { method: 'DELETE' }).catch(() => undefined);
    setDrafts((x) => x.filter((y) => y.id !== d.id));
    setToast(t('Draft deleted', 'ลบฉบับร่างแล้ว'));
  }

  const list = useMemo(() => {
    if (!rows) return null;
    if (filter === 'short') return rows.filter((s) => s.questionCount <= 10);
    if (filter === 'reward') return [...rows].sort((a, b) => b.rewardPerResponse - a.rewardPerResponse);
    if (filter === 'all') return [...rows].sort((a, b) => Number(a.responded) - Number(b.responded));
    return rows;
  }, [rows, filter]);

  return (
    <div className="space-y-3">
      <PageHeading title={t('Survey', 'แบบสอบถาม')} subtitle={t('Share your thoughts and get rewarded!', 'แบ่งปันความคิดเห็นแล้วรับเหรียญ')} create={{ href: '/surveys/new', label: t('Create', 'สร้าง') }} />
      <FeedTabs active="survey" />
      <div role="tablist" aria-label={t('Filters', 'ตัวกรอง')} className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-0.5">
        {FILTERS.map((f) => <Chip key={f.key} active={filter === f.key} onClick={() => router.replace(f.key === 'all' ? '/surveys' : `/surveys?tab=${f.key}`)}>{t(f.en, f.th)}</Chip>)}
      </div>
      {mine && drafts.length > 0 && (
        <div className="space-y-2.5">
          {drafts.map((d) => <DraftCard key={d.id} d={d} onDelete={() => removeDraft(d)} />)}
        </div>
      )}
      {list === null ? <Spinner />
        : list.length === 0 ? (
          mine && drafts.length ? null : <EmptyState icon={<ClipboardList />} title={mine ? t('No surveys created yet.', 'คุณยังไม่ได้โพสต์แบบสอบถาม') : filter === 'saved' ? t('No saved surveys yet', 'ยังไม่ได้บันทึกแบบสอบถาม') : t('No open surveys yet', 'ยังไม่มีแบบสอบถามที่เปิดรับ')}
            text={mine ? t('Post a research survey and reward participants with Coin.', 'โพสต์แบบสอบถามงานวิจัย แล้วให้เหรียญเป็นรางวัลกับผู้ตอบ') : t('Be the first to post one!', 'เป็นคนแรกที่โพสต์เลย')}
            action={<Link href="/surveys/new" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">{t('Post a survey', 'โพสต์แบบสอบถาม')}</Link>} />
        ) : <div className="space-y-2.5">{list.map((s) => <SurveyCard key={s.id} s={s} onToast={setToast} />)}</div>}
      {toast && <Toast onClose={() => setToast('')}>{toast}</Toast>}
    </div>
  );
}

/** ฉบับร่างใน "แบบสอบถามของฉัน" (Figma: My survey card + ป้าย DRAFT) */
function DraftCard({ d, onDelete }: { d: DraftSummary; onDelete: () => void }) {
  const { t } = useT();
  return (
    <article className="space-y-2.5 rounded-2xl bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-wide text-primary">{t('SURVEY', 'แบบสอบถาม')}</p>
          <h3 className="line-clamp-2 text-lg leading-snug font-extrabold">{d.title || t('Untitled survey', 'แบบสอบถามที่ยังไม่มีชื่อ')}</h3>
        </div>
        <span className="shrink-0 rounded-full bg-coin-soft px-2.5 py-1 text-[11px] font-extrabold tracking-wide text-warning-foreground">{t('DRAFT', 'ฉบับร่าง')}</span>
      </div>
      <div className="space-y-1">
        <p className="text-xs font-bold text-indigo">{t(`${d.stepsDone} of 4 steps complete`, `ทำแล้ว ${d.stepsDone} จาก 4 ขั้น`)}</p>
        <Progress value={(d.stepsDone / 4) * 100} />
        <p className="text-[11px] text-muted-foreground">{t('Last edited', 'แก้ไขล่าสุด')} {fmtDate(d.updatedAt)}</p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onDelete} aria-label={t('Delete draft', 'ลบฉบับร่าง')} className={buttonCls('outline', 'sm')}><Trash2 />{t('Delete', 'ลบ')}</button>
        <Link href={`/surveys/new?draft=${d.id}`} className={buttonCls('primary', 'sm') + ' flex-1'}><FilePen />{t('Continue editing', 'แก้ไขต่อ')}</Link>
      </div>
    </article>
  );
}
