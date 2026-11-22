'use client';
import { FormEvent, useState } from 'react';
import { post } from '@/lib/api';
import { Button, Card, ErrorText, Input, Notice, SectionHeader } from '@/components/ui';
import { useT } from '@/lib/i18n';

/** แอดมิน: เพิ่ม Coin ให้บัญชี (ใช้ทดสอบ — ระบบเติม Coin จริงยังไม่เปิด) */
export function GrantCoins() {
  const { t } = useT();
  const [form, setForm] = useState({ email: '', amount: '5000', memo: t('Test Coin', 'เหรียญสำหรับทดสอบระบบ') });
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setDone('');
    if (!window.confirm(t(`Add ${Number(form.amount).toLocaleString()} Coin to ${form.email}?`, `เพิ่ม ${Number(form.amount).toLocaleString()} เหรียญให้ ${form.email}?`))) return;
    setBusy(true);
    try {
      const r = await post<{ displayName: string | null; email: string; balance: number }>('/admin/coins/grant', { ...form, amount: Number(form.amount) });
      setDone(t(`Added. ${r.displayName ?? r.email} now has ${r.balance.toLocaleString()} Coin`, `เพิ่มแล้ว — ${r.displayName ?? r.email} มี ${r.balance.toLocaleString()} เหรียญ`));
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="space-y-4">
      <SectionHeader title={t('Add test Coin', 'เพิ่มเหรียญทดสอบ')} subtitle={t('Creates new Coin in an account and records which admin added it in the Coin history', 'สร้างเหรียญใหม่เข้าบัญชี และบันทึกในประวัติเหรียญว่าแอดมินคนไหนเพิ่ม')} />
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-3">
          <Input label={t('Account email (login or @cmu.ac.th)', 'อีเมลของบัญชี (อีเมลล็อกอินหรือ @cmu.ac.th)')} type="email" required value={form.email} onChange={set('email')} />
          <div className="grid grid-cols-2 gap-2">
            <Input label={t('Amount of Coin', 'จำนวนเหรียญ')} type="number" min={1} max={100000} required value={form.amount} onChange={set('amount')} />
            <Input label={t('Reason', 'เหตุผล')} required maxLength={120} value={form.memo} onChange={set('memo')} />
          </div>
          <ErrorText>{error}</ErrorText>
          {done && <Notice tone="success">{done}</Notice>}
          <Button className="w-full" disabled={busy}>{busy ? t('Adding…', 'กำลังเพิ่ม…') : t('Add Coin', 'เพิ่มเหรียญ')}</Button>
        </form>
      </Card>
    </div>
  );
}
