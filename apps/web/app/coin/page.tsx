'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowDownLeft, ArrowUpRight, CalendarDays, ClipboardList, Coins, Gift, History, Sparkles } from 'lucide-react';
import { TX_LABEL, type WalletEntry, type WalletResponse } from '@tembo/shared';
import { api } from '@/lib/api';
import { AppShell, useMe } from '@/components/shell';
import { Button, cx, EmptyState, fmtDate, Spinner } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function CoinPage() {
  return <AppShell><Coin /></AppShell>;
}

/** Figma: COIN / Home + COIN / History — Coin ไม่ใช่เงินจริง จึงไม่มีเติมเงิน/ถอนเงิน */
function Coin() {
  const { me } = useMe();
  const { t, p } = useT();
  const [w, setW] = useState<WalletResponse | null>(null);
  const [more, setMore] = useState<WalletEntry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { api<WalletResponse>('/me/wallet?limit=20').then((r) => { setW(r); setNext(r.nextBefore); }).catch(() => undefined); }, [me.balance]);

  async function loadMore() {
    if (!next) return;
    setLoading(true);
    try {
      const r = await api<WalletResponse>(`/me/wallet?limit=30&before=${encodeURIComponent(next)}`);
      setMore((m) => [...m, ...r.entries]); setNext(r.nextBefore);
    } finally { setLoading(false); }
  }

  if (!w) return <Spinner />;
  const entries = [...w.entries, ...more];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-extrabold tracking-tight">Coin</h1>
        <span className="flex items-center gap-1 rounded-full bg-coin-soft px-3 py-2 text-[13px] font-bold"><Coins className="size-4 text-warning" />{w.balance.toLocaleString()}</span>
      </div>
      <p className="text-xs text-muted-foreground">{t('You earn Coin by taking part in TEMBO. Use it to post, give rewards and redeem gifts. Coin is not real money: it cannot be bought, cashed out or transferred.', 'Coin ได้จากการทำกิจกรรมในแอปเท่านั้น ใช้โพสต์ ให้รางวัล และแลกของรางวัล ไม่ใช่เงินจริง เติมเงินหรือแลกเป็นเงินไม่ได้ และโอนให้กันไม่ได้')}</p>

      <section className="relative overflow-hidden rounded-3xl bg-indigo p-5 text-white shadow-float">
        <div aria-hidden className="absolute -top-10 -right-8 size-36 rounded-full bg-coin/25" />
        <p className="relative text-sm opacity-80">{t('Your Coin', 'Coin ของคุณ')}</p>
        <p className="relative mt-1 flex items-baseline gap-2"><span className="text-[34px] leading-none font-extrabold">{w.balance.toLocaleString()}</span><span className="font-bold text-coin">Coin</span></p>
        <p className="relative mt-3 text-xs opacity-80">{me.cmuVerified ? t('Ready to post surveys, create events and sponsor friends', 'พร้อมใช้โพสต์แบบสอบถาม สร้างกิจกรรม และสนับสนุนเพื่อน') : t('Verify your @cmu.ac.th email to earn Coin from surveys', 'ยืนยันอีเมล @cmu.ac.th เพื่อรับ Coin จากการตอบแบบสอบถาม')}</p>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/feed?tab=foryou" className="flex h-[50px] items-center justify-center gap-2 rounded-[14px] bg-primary text-[15px] font-bold text-white"><Sparkles className="size-[18px]" />{t('Earn Coin', 'หา Coin')}</Link>
        <Link href="/surveys/new" className="flex h-[50px] items-center justify-center gap-2 rounded-[14px] border border-input bg-card text-[15px] font-bold"><ClipboardList className="size-[18px]" />{t('Use Coin', 'ใช้ Coin')}</Link>
      </div>
      <Link href="/rewards" className="flex h-[50px] items-center justify-center gap-2 rounded-[14px] bg-coin text-[15px] font-bold text-indigo"><Gift className="size-[18px]" />{t('Redeem rewards', 'แลกของรางวัล')}</Link>

      <div className="grid grid-cols-2 gap-2">
        <Stat label={t('Total earned', 'ได้รับทั้งหมด')} value={w.earned} icon={<ArrowDownLeft />} tone="text-success" />
        <Stat label={t('Spent (net)', 'ใช้ไปแล้ว (สุทธิ)')} value={w.spent} icon={<ArrowUpRight />} tone="text-destructive" />
      </div>

      <section className="space-y-2">
        <div className="flex items-center justify-between pt-2">
          <h2 className="flex items-center gap-1.5 text-[15px] font-extrabold"><History className="size-4" />{t('Coin history', 'ประวัติ Coin')}</h2>
          <span className="text-xs text-muted-foreground">{t(`${entries.length} items`, `${entries.length} รายการ`)}</span>
        </div>
        {entries.length === 0 ? <EmptyState icon={<CalendarDays />} title={t('No activity yet', 'ยังไม่มีรายการ')} /> : (
          <ul className="divide-y divide-border rounded-2xl bg-card px-3 shadow-card">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{e.memo ?? p(TX_LABEL[e.type])}</p>
                  <p className="text-[11px] text-muted-foreground">{e.memo ? `${p(TX_LABEL[e.type])} · ` : ''}{fmtDate(e.createdAt)}</p>
                </div>
                <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold', e.delta > 0 ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive')}>
                  {e.delta > 0 ? '+' : '−'}{Math.abs(e.delta).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
        {next && <Button variant="outline" className="w-full" disabled={loading} onClick={loadMore}>{loading ? t('Loading…', 'กำลังโหลด…') : t('Load more', 'ดูเพิ่ม')}</Button>}
      </section>
    </div>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-2xl bg-card p-3.5 shadow-card">
      <p className={cx('flex items-center gap-1 text-xs text-muted-foreground [&_svg]:size-4', tone)}>{icon}<span className="text-muted-foreground">{label}</span></p>
      <p className="mt-1 text-xl font-extrabold">{value.toLocaleString()}</p>
    </div>
  );
}
