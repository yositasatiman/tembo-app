'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Copy, PenLine, ShieldCheck } from 'lucide-react';
import { post, api } from '@/lib/api';
import { AppShell, useMe } from '@/components/shell';
import { Avatar, Badge, Button, buttonCls, Card, ErrorText, fmtDate, Input, Notice, SectionHeader, yearLabel } from '@/components/ui';

interface WalletRes { balance: number; entries: { id: string; delta: number; memo: string | null; createdAt: string }[] }

export default function MePage() {
  return <AppShell><Me /></AppShell>;
}

function Me() {
  const { me, reload } = useMe();
  const [wallet, setWallet] = useState<WalletRes | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { api<WalletRes>('/me/wallet').then(setWallet).catch(() => undefined); }, [me.balance]);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-primary p-6 text-primary-foreground shadow-float">
        <div aria-hidden className="absolute -top-16 -right-10 size-56 rounded-full bg-primary-foreground/10" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm opacity-80">Coin ของฉัน</p>
            <p className="font-display text-4xl font-semibold">{me.balance.toLocaleString()}</p>
            <p className="mt-1 text-xs opacity-80">ได้จากการตอบแบบสอบถามแล้ว {me.stats.coinEarned.toLocaleString()} Coin</p>
          </div>
          <button onClick={() => { navigator.clipboard?.writeText(me.referralCode); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="flex items-center gap-2 rounded-xl bg-primary-foreground/15 px-4 py-2.5 text-sm backdrop-blur hover:bg-primary-foreground/25">
            โค้ดชวนเพื่อน <b className="font-mono tracking-widest">{me.referralCode}</b><Copy className="size-4" />{copied && 'คัดลอกแล้ว'}
          </button>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Avatar name={me.displayName} />
            <div>
              <p className="font-display font-semibold">{me.displayName}</p>
              <p className="text-sm text-muted-foreground">คณะ{me.faculty} · {yearLabel(me.studyYear)}</p>
              <p className="text-xs text-muted-foreground">{me.email}</p>
            </div>
          </div>
          <Link href="/onboarding" className={buttonCls('outline', 'sm')}><PenLine />แก้ไข</Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {me.interests.map((i) => <Badge key={i}>{i}</Badge>)}
        </div>
      </Card>

      <CmuVerifyCard verified={me.cmuVerified} cmuEmail={me.cmuEmail} onVerified={reload} />

      <section className="space-y-3">
        <SectionHeader title="ประวัติ Coin" subtitle="20 รายการล่าสุด" />
        <Card className="p-2">
          {wallet?.entries.length ? (
            <ul className="divide-y divide-border">
              {wallet.entries.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-3 py-3 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate">{e.memo ?? 'รายการ'}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(e.createdAt)}</span>
                  </span>
                  <span className={`shrink-0 font-semibold ${e.delta > 0 ? 'text-success' : 'text-destructive'}`}>{e.delta > 0 ? '+' : ''}{e.delta}</span>
                </li>
              ))}
            </ul>
          ) : <p className="p-4 text-sm text-muted-foreground">ยังไม่มีรายการ</p>}
        </Card>
      </section>
    </div>
  );
}

function CmuVerifyCard({ verified, cmuEmail: verifiedEmail, onVerified }: { verified: boolean; cmuEmail: string | null; onVerified: () => void }) {
  const [cmuEmail, setCmuEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (verified) {
    return (
      <Card id="cmu" className="flex items-center gap-3">
        <Badge><BadgeCheck />สมาชิกที่ยืนยัน CMU แล้ว</Badge>
        <span className="text-sm text-muted-foreground">{verifiedEmail}</span>
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
    <Card id="cmu" className="space-y-4 p-6">
      <div>
        <h3 className="flex items-center gap-2 font-display font-semibold"><ShieldCheck className="size-5 text-primary" />ยืนยันว่าเป็นชาว มช.</h3>
        <p className="text-sm text-muted-foreground">ยืนยันอีเมล @cmu.ac.th เพื่อรับ Coin จากการตอบแบบสอบถาม และขอระบบสมทบได้</p>
      </div>
      {!sent ? (
        <form onSubmit={send} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1"><Input label="อีเมล CMU" type="email" required placeholder="firstname_l@cmu.ac.th" value={cmuEmail} onChange={(e) => setCmuEmail(e.target.value)} /></div>
          <Button disabled={loading || !cmuEmail}>ส่งรหัสยืนยัน</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <Notice>ส่งรหัส 6 หลักไปที่ {cmuEmail} แล้ว</Notice>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1"><Input label="รหัสยืนยัน" inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
            <Button disabled={loading || code.length !== 6}>ยืนยัน</Button>
          </div>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
