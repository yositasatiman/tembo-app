'use client';
import { FormEvent, useState } from 'react';
import { post } from '@/lib/api';
import { Button, Card, ErrorText, Input, Notice, SectionHeader } from '@/components/ui';

/** แอดมิน: เพิ่ม Coin ให้บัญชี (ใช้ทดสอบ — ระบบเติม Coin จริงยังไม่เปิด) */
export function GrantCoins() {
  const [form, setForm] = useState({ email: '', amount: '5000', memo: 'Coin สำหรับทดสอบระบบ' });
  const [done, setDone] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(''); setDone('');
    if (!window.confirm(`เพิ่ม ${Number(form.amount).toLocaleString()} Coin ให้ ${form.email}?`)) return;
    setBusy(true);
    try {
      const r = await post<{ displayName: string | null; email: string; balance: number }>('/admin/coins/grant', { ...form, amount: Number(form.amount) });
      setDone(`เพิ่มแล้ว — ${r.displayName ?? r.email} มี ${r.balance.toLocaleString()} Coin`);
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <div className="space-y-4">
      <SectionHeader title="เพิ่ม Coin ทดสอบ" subtitle="สร้าง Coin ใหม่เข้าบัญชี และบันทึกในประวัติ Coin ว่าแอดมินคนไหนเพิ่ม" />
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-3">
          <Input label="อีเมลของบัญชี (อีเมลล็อกอินหรือ @cmu.ac.th)" type="email" required value={form.email} onChange={set('email')} />
          <div className="grid grid-cols-2 gap-2">
            <Input label="จำนวน Coin" type="number" min={1} max={100000} required value={form.amount} onChange={set('amount')} />
            <Input label="เหตุผล" required maxLength={120} value={form.memo} onChange={set('memo')} />
          </div>
          <ErrorText>{error}</ErrorText>
          {done && <Notice tone="success">{done}</Notice>}
          <Button className="w-full" disabled={busy}>{busy ? 'กำลังเพิ่ม…' : 'เพิ่ม Coin'}</Button>
        </form>
      </Card>
    </div>
  );
}
