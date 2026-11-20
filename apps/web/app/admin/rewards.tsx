'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import type { AdminRedemptionItem, RewardItem } from '@tembo/shared';
import { api, patch, post } from '@/lib/api';
import { Button, Card, ErrorText, Field, fmtDate, Input, inputCls, SectionHeader } from '@/components/ui';

type AdminReward = RewardItem & { pending: number; fulfilled: number };
const blank = { title: '', description: '', imageUrl: '', cost: '50', stock: '10', perUserLimit: '1' };

/** แอดมิน: จัดการของรางวัล + ส่งมอบ/ยกเลิกการแลก */
export function AdminRewards() {
  const [rewards, setRewards] = useState<AdminReward[] | null>(null);
  const [queue, setQueue] = useState<AdminRedemptionItem[] | null>(null);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<AdminReward[]>('/admin/rewards').then(setRewards).catch((e) => setError((e as Error).message));
    api<AdminRedemptionItem[]>('/admin/rewards/redemptions').then(setQueue).catch(() => undefined);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault(); setError('');
    const body = { ...form, cost: Number(form.cost), stock: Number(form.stock), perUserLimit: Number(form.perUserLimit) };
    try {
      if (editing) await patch(`/admin/rewards/${editing}`, body); else await post('/admin/rewards', body);
      setForm(blank); setEditing(null); setShowForm(false); load();
    } catch (err) { setError((err as Error).message); }
  }

  function edit(r: AdminReward) {
    setEditing(r.id); setShowForm(true);
    setForm({ title: r.title, description: r.description, imageUrl: r.imageUrl ?? '', cost: String(r.cost), stock: String(r.stock), perUserLimit: String(r.perUserLimit) });
  }

  async function toggle(r: AdminReward) {
    try { await patch(`/admin/rewards/${r.id}`, { active: !r.active }); load(); } catch (e) { setError((e as Error).message); }
  }

  async function decide(id: string, action: 'FULFILL' | 'CANCEL') {
    const note = window.prompt(action === 'FULFILL' ? 'ข้อความถึงผู้ใช้ (ไม่บังคับ) เช่น จุดรับของ' : 'เหตุผลที่ยกเลิก (ผู้ใช้จะเห็น และได้ Coin คืน)');
    if (note === null || (action === 'CANCEL' && !note.trim())) return;
    try { await post(`/admin/rewards/redemptions/${id}`, { action, note: note.trim() || undefined }); load(); }
    catch (e) { setError((e as Error).message); }
  }

  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <SectionHeader title="ร้านรางวัล" subtitle="ผู้ใช้แลกแล้ว Coin จะถูกหักทันที — กดส่งมอบเมื่อให้ของแล้ว หรือยกเลิกเพื่อคืน Coin และคืนสต็อก"
        action={!showForm && <Button size="sm" onClick={() => { setForm(blank); setEditing(null); setShowForm(true); }}>เพิ่มของรางวัล</Button>} />
      <ErrorText>{error}</ErrorText>

      {showForm && (
        <Card className="p-6">
          <form onSubmit={save} className="space-y-3">
            <Input label="ชื่อของรางวัล" required maxLength={80} value={form.title} onChange={set('title')} />
            <Field label="รายละเอียดและวิธีรับของ">
              <textarea className={inputCls} rows={3} required maxLength={1000} value={form.description} onChange={set('description')} placeholder="เช่น รับที่ห้อง CPE ภายใน 7 วันหลังแลก" />
            </Field>
            <Input label="ลิงก์รูปภาพ (ไม่บังคับ)" type="url" placeholder="https://" value={form.imageUrl} onChange={set('imageUrl')} />
            <div className="grid grid-cols-3 gap-2">
              <Input label="ราคา (Coin)" type="number" min={1} required value={form.cost} onChange={set('cost')} />
              <Input label="จำนวน" type="number" min={0} required value={form.stock} onChange={set('stock')} />
              <Input label="สิทธิ์ต่อคน" type="number" min={1} required value={form.perUserLimit} onChange={set('perUserLimit')} />
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="flex-1" onClick={() => { setShowForm(false); setEditing(null); }}>ยกเลิก</Button>
              <Button className="flex-1">{editing ? 'บันทึก' : 'เพิ่ม'}</Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="p-0">
        <h3 className="px-4 pt-4 text-sm font-extrabold">รอส่งมอบ ({queue?.length ?? 0})</h3>
        {queue?.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">ไม่มีรายการรอส่งมอบ</p>}
        <ul className="divide-y divide-border">
          {queue?.map((q) => (
            <li key={q.id} className="space-y-2 px-4 py-3">
              <p className="text-sm font-bold">{q.reward.title} <span className="font-normal text-muted-foreground">· {q.cost} Coin</span></p>
              <p className="text-xs text-muted-foreground">{q.user.displayName} · {q.user.faculty} · {q.user.cmuEmail ?? q.user.email} · {fmtDate(q.createdAt)}</p>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1" onClick={() => decide(q.id, 'FULFILL')}>ส่งมอบแล้ว</Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => decide(q.id, 'CANCEL')}>ยกเลิก + คืน Coin</Button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-0">
        <h3 className="px-4 pt-4 text-sm font-extrabold">ของรางวัลทั้งหมด</h3>
        {rewards?.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">ยังไม่มีของรางวัล</p>}
        <ul className="divide-y divide-border">
          {rewards?.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{r.title}{!r.active && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(ปิดอยู่)</span>}</p>
                <p className="text-xs text-muted-foreground">{r.cost} Coin · เหลือ {r.stock} · รอส่ง {r.pending} · ส่งแล้ว {r.fulfilled}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => edit(r)}>แก้ไข</Button>
              <Button size="sm" variant="outline" onClick={() => toggle(r)}>{r.active ? 'ปิด' : 'เปิด'}</Button>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
