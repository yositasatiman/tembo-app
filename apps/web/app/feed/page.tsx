'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, ShieldAlert, Sparkles } from 'lucide-react';
import { interestLabel, type FeedItem } from '@tembo/shared';
import { useT } from '@/lib/i18n';
import { api } from '@/lib/api';
import { AppShell, FeedTabs, PageHeading, useMe } from '@/components/shell';
import { SurveyCard } from '@/components/survey/card';
import { EventCard } from '@/components/event/card';
import { EmptyState, Spinner, Toast } from '@/components/ui';

export default function FeedPage() {
  return <AppShell><Suspense fallback={<Spinner />}><Feed /></Suspense></AppShell>;
}

/** Figma: FEED / All Feed + FEED / Your Feed */
function Feed() {
  const { me } = useMe();
  const { t, p } = useT();
  const params = useSearchParams();
  const tab = params.get('tab') === 'foryou' ? 'foryou' : 'all';
  const q = (params.get('q') ?? '').trim();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => {
    setItems(null);
    api<FeedItem[]>(`/feed?tab=${q ? 'all' : tab}`).then(setItems).catch(() => setItems([]));
  }, [tab, q]);

  const list = useMemo(() => {
    if (!items || !q) return items;
    const needle = q.toLowerCase();
    return items.filter((i) => {
      const text = i.kind === 'survey'
        ? `${i.survey.title} ${i.survey.description ?? ''} ${i.survey.ownerName ?? ''} ${i.survey.tags.join(' ')}`
        : `${i.event.title} ${i.event.hostName} ${i.event.location} ${i.event.tags.join(' ')}`;
      return text.toLowerCase().includes(needle);
    });
  }, [items, q]);

  return (
    <div className="space-y-3">
      <PageHeading title={q ? t(`Search “${q}”`, `ค้นหา “${q}”`) : t('Feed', 'ฟีด')}
        subtitle={tab === 'foryou' && !q ? `${t('Picked from your interests', 'เลือกจากความสนใจของคุณ')}: ${me.interests.map((i) => p(interestLabel(i))).join(', ')}` : t('What is happening around campus', 'มีอะไรเกิดขึ้นบ้างในมหาวิทยาลัย')}
        create={{ href: '/surveys/new', label: t('Create', 'โพสต์') }} />
      {!q && <FeedTabs active={tab} />}

      {!me.cmuVerified && (
        <Link href="/me#cmu" className="flex items-center gap-3 rounded-2xl bg-coin-soft p-3 text-xs text-indigo">
          <ShieldAlert className="size-5 shrink-0 text-warning" />
          <span><b>{t('Verify your @cmu.ac.th email', 'ยืนยันอีเมล @cmu.ac.th')}</b> {t('to earn Coin from surveys and event check-ins', 'เพื่อรับ Coin จากการตอบแบบสอบถามและเช็กอินกิจกรรม')}</span>
        </Link>
      )}
      {tab === 'foryou' && !q && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Sparkles className="size-4 shrink-0 text-primary" />
          <span>{t('Sorted by how well posts match your interests. Higher rewards help a little.', 'เรียงจากความตรงกับความสนใจก่อน รางวัลสูงช่วยดันได้บ้าง')} <Link href="/onboarding" className="font-bold whitespace-nowrap text-primary">{t('Edit interests', 'ปรับความสนใจ')}</Link></span>
        </p>
      )}

      {list === null ? <Spinner />
        : list.length === 0 ? (
          q ? <EmptyState icon={<Search />} title={t('No results', 'ไม่พบผลลัพธ์')} text={t('Try another keyword, or browse all surveys and events', 'ลองค้นด้วยคำอื่น หรือดูแบบสอบถาม/กิจกรรมทั้งหมด')} />
            : <EmptyState icon={<Sparkles />} title={t('Nothing new yet', 'ยังไม่มีโพสต์ใหม่')} text={t('You are all caught up, or nobody has posted yet. Be the first!', 'ทำครบทุกอย่างแล้ว หรือยังไม่มีใครโพสต์ — ลองเป็นคนแรก')}
              action={<div className="flex gap-2"><Link href="/surveys/new" className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white">{t('Post a survey', 'โพสต์แบบสอบถาม')}</Link><Link href="/events/new" className="rounded-xl bg-lavender-soft px-4 py-2.5 text-sm font-bold text-primary">{t('Create an event', 'สร้างกิจกรรม')}</Link></div>} />
        ) : (
          <div className="space-y-2.5">
            {list.map((i) => i.kind === 'survey'
              ? <SurveyCard key={`s-${i.id}`} s={i.survey} reason={tab === 'foryou' ? i.reasons[0] : undefined} onToast={setToast} />
              : <EventCard key={`e-${i.id}`} e={i.event} reason={tab === 'foryou' ? i.reasons[0] : undefined} onToast={setToast} />)}
          </div>
        )}
      {toast && <Toast onClose={() => setToast('')}>{toast}</Toast>}
    </div>
  );
}
