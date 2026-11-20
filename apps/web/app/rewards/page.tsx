'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Coins, Gift, PackageCheck, ShieldAlert } from 'lucide-react';
import { REDEMPTION_STATUS_LABEL, type RedemptionItem, type RewardItem } from '@tembo/shared';
import { api, post } from '@/lib/api';
import { AppShell, PageHeading, useMe } from '@/components/shell';
import { Banner, Button, cx, EmptyState, ErrorText, fmtDate, Modal, Spinner, Toast } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function RewardsPage() {
  return <AppShell><Rewards /></AppShell>;
}

const TABS = [{ key: 'shop', en: 'Rewards', th: 'ของรางวัล' }, { key: 'mine', en: 'My redemptions', th: 'การแลกของฉัน' }] as const;

/** ร้านรางวัล — ใช้ Coin แลกของ (Coin ไม่ใช่เงินจริง เติมเงินหรือแลกกลับเป็นเงินไม่ได้) */
function Rewards() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get('tab') === 'mine' ? 'mine' : 'shop';
  const { me, reload } = useMe();
  const { t, p } = useT();
  const [items, setItems] = useState<RewardItem[] | null>(null);
  const [mine, setMine] = useState<RedemptionItem[] | null>(null);
  const [confirm, setConfirm] = useState<RewardItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    api<RewardItem[]>('/rewards').then(setItems).catch((e) => setError((e as Error).message));
    api<RedemptionItem[]>('/rewards/mine').then(setMine).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function redeem(r: RewardItem) {
    setBusy(true); setError('');
    try {
      await post(`/rewards/${r.id}/redeem`);
      setConfirm(null); setToast(t(`Redeemed “${r.title}”. Waiting for an admin to hand it over.`, `แลก “${r.title}” แล้ว รอแอดมินส่งมอบ`));
      load(); reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  async function cancel(id: string) {
    if (!window.confirm(t('Cancel this redemption? Your Coin will be refunded in full.', 'ยกเลิกการแลกนี้? ระบบจะคืน Coin ให้เต็มจำนวน'))) return;
    try { await post(`/rewards/redemptions/${id}/cancel`); setToast(t('Cancelled. Your Coin has been refunded.', 'ยกเลิกแล้ว คืน Coin เรียบร้อย')); load(); reload(); }
    catch (e) { setError((e as Error).message); }
  }

  const pending = mine?.filter((m) => m.status === 'PENDING').length ?? 0;

  return (
    <div className="space-y-3">
      <PageHeading title={t('Rewards', 'ร้านรางวัล')} subtitle={t('Collect Coin from surveys and event check-ins, then trade it for rewards', 'สะสม Coin จากการตอบแบบสอบถามและเช็กอินกิจกรรม แล้วนำมาแลกของรางวัล')} />

      <nav aria-label={t('Reward sections', 'ส่วนของร้านรางวัล')} className="flex gap-[7px]">
        {TABS.map((x) => (
          <button key={x.key} type="button" aria-current={tab === x.key ? 'page' : undefined}
            onClick={() => router.replace(x.key === 'shop' ? '/rewards' : '/rewards?tab=mine')}
            className={cx('rounded-full px-3 py-2 text-xs font-bold', tab === x.key ? 'bg-indigo text-white' : 'bg-card text-muted-foreground hover:text-indigo')}>
            {t(x.en, x.th)}{x.key === 'mine' && pending > 0 ? ` (${pending})` : ''}
          </button>
        ))}
      </nav>

      {!me.cmuVerified && (
        <Banner tone="warning" icon={<ShieldAlert />} title={t('Verify your @cmu.ac.th email before redeeming', 'ยืนยันอีเมล @cmu.ac.th ก่อนแลกของรางวัล')}>
          {t('This stops fake accounts from collecting Coin', 'กันบัญชีปลอมมาสะสม Coin')} — <Link href="/me" className="font-bold underline">{t('Verify on your profile', 'ไปยืนยันที่โปรไฟล์')}</Link>
        </Banner>
      )}
      <ErrorText>{error}</ErrorText>

      {tab === 'shop' ? (
        !items ? <Spinner /> : items.length === 0
          ? <EmptyState icon={<Gift />} title={t('No rewards yet', 'ยังไม่มีของรางวัล')} text={t('The admins are preparing rewards. Check back soon!', 'แอดมินกำลังเตรียมของรางวัล กลับมาดูอีกครั้งนะ')} />
          : (
            <ul className="grid grid-cols-2 gap-2.5">
              {items.map((r) => {
                const limitHit = r.redeemedByMe >= r.perUserLimit;
                const soldOut = r.stock <= 0;
                const short = me.balance < r.cost;
                const reason = soldOut ? t('Sold out', 'หมดแล้ว') : limitHit ? t('Limit reached', 'แลกครบสิทธิ์แล้ว') : short ? t(`Need ${(r.cost - me.balance).toLocaleString()} more`, `ขาดอีก ${(r.cost - me.balance).toLocaleString()}`) : null;
                return (
                  <li key={r.id} className="flex flex-col overflow-hidden rounded-2xl bg-card shadow-card">
                    <div className="flex aspect-[4/3] items-center justify-center bg-lavender-soft">
                      {r.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={r.imageUrl} alt="" className="size-full object-cover" />
                        : <Gift className="size-10 text-primary/60" />}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <p className="line-clamp-2 text-sm font-extrabold">{r.title}</p>
                      <p className="line-clamp-2 text-[11px] text-muted-foreground">{r.description}</p>
                      <p className="mt-auto pt-1 text-[11px] text-muted-foreground">{t(`${r.stock} left`, `เหลือ ${r.stock} ชิ้น`)}{r.perUserLimit > 1 ? t(` · ${r.perUserLimit} per person`, ` · คนละ ${r.perUserLimit}`) : ''}</p>
                      <Button size="sm" className="mt-1 w-full" disabled={!!reason || !me.cmuVerified} onClick={() => { setError(''); setConfirm(r); }}>
                        {reason ?? <><Coins className="size-4" />{r.cost.toLocaleString()}</>}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )
      ) : (
        !mine ? <Spinner /> : mine.length === 0
          ? <EmptyState icon={<PackageCheck />} title={t('No redemptions yet', 'ยังไม่ได้แลกของรางวัล')} />
          : (
            <ul className="divide-y divide-border rounded-2xl bg-card px-3 shadow-card">
              {mine.map((m) => (
                <li key={m.id} className="space-y-1 py-3">
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm font-bold">{m.reward.title}</p>
                    <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold',
                      m.status === 'PENDING' ? 'bg-coin-soft text-warning' : m.status === 'FULFILLED' ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground')}>
                      {p(REDEMPTION_STATUS_LABEL[m.status])}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{m.cost.toLocaleString()} Coin · {t('redeemed', 'แลกเมื่อ')} {fmtDate(m.createdAt)}{m.status === 'CANCELLED' ? t(' · Coin refunded', ' · คืน Coin แล้ว') : ''}</p>
                  {m.note && <p className="rounded-lg bg-lavender-soft px-2.5 py-1.5 text-xs">{m.note}</p>}
                  {m.status === 'PENDING' && <button type="button" onClick={() => cancel(m.id)} className="text-xs font-bold text-destructive hover:underline">{t('Cancel redemption', 'ยกเลิกการแลก')}</button>}
                </li>
              ))}
            </ul>
          )
      )}

      {confirm && (
        <Modal label={t('Confirm redemption', 'ยืนยันการแลก')} onClose={() => !busy && setConfirm(null)}>
          <div className="space-y-3">
            <h2 className="text-lg font-extrabold">{t(`Redeem “${confirm.title}”?`, `แลก “${confirm.title}”?`)}</h2>
            <p className="text-sm whitespace-pre-line">{confirm.description}</p>
            <p className="rounded-xl bg-coin-soft px-3 py-2 text-sm">{t('Uses', 'ใช้')} <b>{confirm.cost.toLocaleString()} Coin</b> · {t('balance after', 'คงเหลือหลังแลก')} {(me.balance - confirm.cost).toLocaleString()} Coin</p>
            <p className="text-xs text-muted-foreground">{t('You can cancel while waiting for pickup and get your Coin back in full.', 'ยกเลิกได้ระหว่างรอรับของ และจะได้ Coin คืนเต็มจำนวน')}</p>
            <ErrorText>{error}</ErrorText>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setConfirm(null)}>{t('Cancel', 'ยกเลิก')}</Button>
              <Button className="flex-1" disabled={busy} onClick={() => redeem(confirm)}>{busy ? t('Redeeming…', 'กำลังแลก…') : t('Redeem', 'ยืนยันแลก')}</Button>
            </div>
          </div>
        </Modal>
      )}
      {toast && <Toast onClose={() => setToast('')} action={tab === 'shop' ? { label: t('View', 'ดูการแลก'), onClick: () => { setToast(''); router.replace('/rewards?tab=mine'); } } : undefined}>{toast}</Toast>}
    </div>
  );
}
