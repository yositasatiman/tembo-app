'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck, Bell, Bookmark, Check, ChevronRight, ClipboardList, Copy, LogOut, PenLine, Settings, ShieldAlert, ShieldCheck, Ticket,
} from 'lucide-react';
import { post } from '@/lib/api';
import { AppShell, useMe } from '@/components/shell';
import { Avatar, Badge, Button, buttonCls, Card, ErrorText, Input, Notice, yearLabel } from '@/components/ui';

export default function MePage() {
  return <AppShell><Me /></AppShell>;
}

/** Figma: ACCOUNT / Profile */
function Me() {
  const { me, reload } = useMe();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  async function logout() {
    if (!window.confirm('ออกจากระบบ?')) return;
    await post('/auth/logout').catch(() => undefined);
    router.replace('/login');
  }
  const stats = [
    { label: 'ตอบแบบสอบถาม', value: me.stats.responses },
    { label: 'โพสต์แบบสอบถาม', value: me.stats.surveysPosted },
    { label: 'ลงทะเบียน Event', value: me.stats.eventsJoined },
    { label: 'เช็กอินแล้ว', value: me.stats.eventsCheckedIn },
  ];
  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <Avatar name={me.displayName} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold">{me.displayName}</h1>
            <p className="text-sm text-muted-foreground">คณะ{me.faculty} · {yearLabel(me.studyYear)}</p>
            {me.cmuVerified
              ? <p className="mt-1 flex items-center gap-1 text-xs font-bold text-success"><BadgeCheck className="size-4" />นักศึกษา มช. ที่ยืนยันแล้ว</p>
              : <a href="#cmu" className="mt-1 flex items-center gap-1 text-xs font-bold text-warning-foreground"><ShieldAlert className="size-4" />ยังไม่ยืนยันอีเมล @cmu.ac.th</a>}
          </div>
          <Link href="/onboarding" className={buttonCls('outline', 'sm')}><PenLine />แก้ไข</Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">{me.interests.map((i) => <span key={i} className="rounded-full bg-lavender-soft px-2.5 py-1 text-xs font-bold text-primary">{i}</span>)}</div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {stats.map((x) => (
            <div key={x.label} className="rounded-xl bg-lavender-soft px-1 py-2">
              <p className="text-lg font-extrabold">{x.value.toLocaleString()}</p>
              <p className="text-[10px] leading-tight text-muted-foreground">{x.label}</p>
            </div>
          ))}
        </div>
      </section>

      <Link href="/coin" className="flex items-center justify-between rounded-2xl bg-indigo p-4 text-white shadow-card">
        <span><span className="block text-xs opacity-80">Coin ของฉัน</span><span className="text-2xl font-extrabold">{me.balance.toLocaleString()}</span></span>
        <span className="flex items-center gap-1 text-sm font-bold text-coin">ดูประวัติ<ChevronRight className="size-4" /></span>
      </Link>

      <nav className="overflow-hidden rounded-2xl bg-card shadow-card">
        {[
          { href: '/surveys?tab=saved', label: 'แบบสอบถามที่บันทึกไว้', icon: Bookmark },
          { href: '/surveys?tab=mine', label: 'แบบสอบถามของฉัน', icon: ClipboardList },
          { href: '/events?filter=mine', label: 'Event ของฉัน', icon: Ticket },
          { href: '/notifications', label: 'แจ้งเตือน', icon: Bell },
          { href: '/onboarding', label: 'แก้ไขโปรไฟล์และความสนใจ', icon: Settings },
        ].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex h-12 items-center gap-3 border-b border-border px-4 text-[15px] font-bold last:border-0 hover:bg-lavender-soft">
            <Icon className="size-5 text-muted-foreground" /><span className="flex-1">{label}</span><ChevronRight className="size-[18px] text-muted-foreground" />
          </Link>
        ))}
      </nav>

      <CmuVerifyCard verified={me.cmuVerified} cmuEmail={me.cmuEmail} onVerified={reload} />

      <section className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-card">
        <div>
          <p className="text-sm font-extrabold">โค้ดชวนเพื่อน</p>
          <p className="text-xs text-muted-foreground">ให้เพื่อนใส่ตอนสมัคร · {me.email}</p>
        </div>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(me.referralCode); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex items-center gap-2 rounded-xl bg-lavender-soft px-3 py-2 font-mono text-sm font-extrabold tracking-widest text-primary">
          {me.referralCode}{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </section>

      <Button variant="danger" className="w-full" onClick={logout}><LogOut />ออกจากระบบ</Button>
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
        <h3 className="flex items-center gap-2 font-extrabold"><ShieldCheck className="size-5 text-primary" />ยืนยันว่าเป็นชาว มช.</h3>
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
