'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { MeResponse } from '@tembo/shared';
import { api, getMe, post } from '@/lib/api';
import { Button, Card, ErrorText, Input, Logo } from '@/components/ui';

interface WalletRes { balance: number; entries: { id: string; delta: number; memo: string | null; createdAt: string }[] }

export default function MePage() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [wallet, setWallet] = useState<WalletRes | null>(null);

  const load = () => Promise.all([getMe(), api<WalletRes>('/me/wallet')])
    .then(([m, w]) => { setMe(m); setWallet(w); })
    .catch(() => router.replace('/login'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function logout() {
    await post('/auth/logout');
    router.replace('/login');
  }

  if (!me) return <p className="pt-32 text-center text-slate-500">กำลังโหลด…</p>;

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <Logo />
        <button onClick={logout} className="text-sm text-slate-500 underline">ออกจากระบบ</button>
      </header>

      <Card className="bg-gradient-to-br from-brand-600 to-brand-500 text-white ring-0">
        <p className="text-sm opacity-80">Coin ของฉัน</p>
        <p className="text-4xl font-bold">{me.balance.toLocaleString()}</p>
        <p className="mt-3 text-sm opacity-80">โค้ดชวนเพื่อน: <span className="font-mono text-base font-bold tracking-widest">{me.referralCode}</span></p>
      </Card>

      <Card>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">{me.displayName}</h2>
            <p className="text-sm text-slate-500">{me.faculty} · {me.studyYear === 7 ? 'บัณฑิตศึกษา' : `ปี ${me.studyYear}`}</p>
          </div>
          <Link href="/onboarding" className="text-sm text-brand-600 underline">แก้ไข</Link>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {me.interests.map((i) => <span key={i} className="rounded-full bg-brand-50 px-2.5 py-1 text-xs text-brand-700">{i}</span>)}
        </div>
      </Card>

      <CmuVerifyCard me={me} onVerified={load} />

      <Card>
        <h3 className="mb-2 font-bold">ประวัติ Coin</h3>
        {wallet?.entries.length ? (
          <ul className="divide-y divide-slate-100">
            {wallet.entries.map((e) => (
              <li key={e.id} className="flex justify-between py-2 text-sm">
                <span>{e.memo ?? 'รายการ'}<br /><span className="text-xs text-slate-400">{new Date(e.createdAt).toLocaleString('th-TH')}</span></span>
                <span className={`font-semibold ${e.delta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{e.delta > 0 ? '+' : ''}{e.delta}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-slate-500">ยังไม่มีรายการ</p>}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/surveys" className="rounded-2xl bg-white p-4 text-center font-semibold text-brand-700 ring-1 ring-brand-100 hover:ring-brand-500">แบบสอบถาม</Link>
        <Link href="/surveys/new" className="rounded-2xl bg-white p-4 text-center font-semibold text-brand-700 ring-1 ring-brand-100 hover:ring-brand-500">+ โพสต์ใหม่</Link>
        {me.role === 'ADMIN' && <Link href="/admin" className="col-span-2 rounded-2xl bg-amber-50 p-3 text-center text-sm font-semibold text-amber-800 ring-1 ring-amber-200">แอดมิน: ตรวจการขอระบบสมทบ</Link>}
      </div>
      <Card className="text-center text-sm text-slate-500">Event — เร็ว ๆ นี้</Card>
    </div>
  );
}

function CmuVerifyCard({ me, onVerified }: { me: MeResponse; onVerified: () => void }) {
  const [cmuEmail, setCmuEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (me.cmuVerified) {
    return (
      <Card className="flex items-center gap-3">
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-sm font-semibold text-emerald-700">✓ Verified CMU</span>
        <span className="text-sm text-slate-600">{me.cmuEmail}</span>
      </Card>
    );
  }

  async function send(e: FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try { await post('/me/cmu-email/request', { cmuEmail }); setSent(true); }
    catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }
  async function verify(e: FormEvent) {
    e.preventDefault(); setError(''); setLoading(true);
    try { await post('/me/cmu-email/verify', { code }); onVerified(); }
    catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  return (
    <Card>
      <h3 className="font-bold">ยืนยันว่าเป็นชาว มช.</h3>
      <p className="mb-4 text-sm text-slate-500">ต้องยืนยันอีเมล @cmu.ac.th ก่อนจึงจะรับ Coin จากการตอบแบบสอบถามและเข้าร่วม Event ได้</p>
      {!sent ? (
        <form onSubmit={send} className="space-y-3">
          <Input label="อีเมล CMU" type="email" required placeholder="firstname_l@cmu.ac.th" value={cmuEmail} onChange={(e) => setCmuEmail(e.target.value)} />
          <ErrorText>{error}</ErrorText>
          <Button disabled={loading || !cmuEmail}>ส่งรหัสยืนยัน</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <Input label={`รหัสที่ส่งไป ${cmuEmail}`} inputMode="numeric" maxLength={6} required value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <ErrorText>{error}</ErrorText>
          <Button disabled={loading || code.length !== 6}>ยืนยัน</Button>
        </form>
      )}
    </Card>
  );
}
