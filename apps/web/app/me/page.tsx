'use client';
import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BadgeCheck, Bell, Bookmark, Check, ChevronRight, ClipboardList, Copy, LogOut, PenLine, Settings, ShieldAlert, ShieldCheck, Ticket,
} from 'lucide-react';
import { facultyLabel, interestLabel } from '@tembo/shared';
import { post } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { AppShell, useMe } from '@/components/shell';
import { Avatar, Badge, Button, buttonCls, Card, ErrorText, Input, Notice, yearLabel } from '@/components/ui';

export default function MePage() {
  return <AppShell><Me /></AppShell>;
}

/** Figma: ACCOUNT / Profile */
function Me() {
  const { me, reload } = useMe();
  const { t, p, lang } = useT();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  async function logout() {
    if (!window.confirm(t('Log out?', 'ออกจากระบบ?'))) return;
    await post('/auth/logout').catch(() => undefined);
    router.replace('/login');
  }
  const stats = [
    { label: t('Surveys answered', 'ตอบแบบสอบถาม'), value: me.stats.responses },
    { label: t('Surveys posted', 'โพสต์แบบสอบถาม'), value: me.stats.surveysPosted },
    { label: t('Events joined', 'ลงทะเบียนกิจกรรม'), value: me.stats.eventsJoined },
    { label: t('Checked in', 'เช็กอินแล้ว'), value: me.stats.eventsCheckedIn },
  ];
  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <Avatar name={me.displayName} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-extrabold">{me.displayName}</h1>
            <p className="text-sm text-muted-foreground">{me.faculty ? (lang === 'th' ? `คณะ${me.faculty}` : `Faculty of ${p(facultyLabel(me.faculty))}`) : ''} · {yearLabel(me.studyYear, lang)}</p>
            {me.cmuVerified
              ? <p className="mt-1 flex items-center gap-1 text-xs font-bold text-success"><BadgeCheck className="size-4" />{t('Verified CMU student', 'นักศึกษา มช. ที่ยืนยันแล้ว')}</p>
              : <a href="#cmu" className="mt-1 flex items-center gap-1 text-xs font-bold text-warning-foreground"><ShieldAlert className="size-4" />{t('@cmu.ac.th email not verified', 'ยังไม่ยืนยันอีเมล @cmu.ac.th')}</a>}
          </div>
          <Link href="/onboarding" className={buttonCls('outline', 'sm')}><PenLine />{t('Edit', 'แก้ไข')}</Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">{me.interests.map((i) => <span key={i} className="rounded-full bg-lavender-soft px-2.5 py-1 text-xs font-bold text-primary">{p(interestLabel(i))}</span>)}</div>
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
        <span><span className="block text-xs opacity-80">{t('My Coin', 'เหรียญของฉัน')}</span><span className="text-2xl font-extrabold">{me.balance.toLocaleString()}</span></span>
        <span className="flex items-center gap-1 text-sm font-bold text-coin">{t('History', 'ดูประวัติ')}<ChevronRight className="size-4" /></span>
      </Link>

      <nav className="overflow-hidden rounded-2xl bg-card shadow-card">
        {[
          { href: '/surveys?filter=saved', label: t('Saved surveys', 'แบบสอบถามที่บันทึกไว้'), icon: Bookmark },
          { href: '/surveys?filter=mine', label: t('My surveys', 'แบบสอบถามของฉัน'), icon: ClipboardList },
          { href: '/events?filter=mine', label: t('My events', 'กิจกรรมของฉัน'), icon: Ticket },
          { href: '/notifications', label: t('Notifications', 'แจ้งเตือน'), icon: Bell },
          { href: '/onboarding', label: t('Edit profile and interests', 'แก้ไขโปรไฟล์และความสนใจ'), icon: Settings },
        ].map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex h-12 items-center gap-3 border-b border-border px-4 text-[15px] font-bold last:border-0 hover:bg-lavender-soft">
            <Icon className="size-5 text-muted-foreground" /><span className="flex-1">{label}</span><ChevronRight className="size-[18px] text-muted-foreground" />
          </Link>
        ))}
      </nav>

      <CmuVerifyCard verified={me.cmuVerified} cmuEmail={me.cmuEmail} onVerified={reload} />

      <section className="flex items-center justify-between gap-3 rounded-2xl bg-card p-4 shadow-card">
        <div>
          <p className="text-sm font-extrabold">{t('Referral code', 'โค้ดชวนเพื่อน')}</p>
          <p className="text-xs text-muted-foreground">{t('Friends enter it when they sign up', 'ให้เพื่อนใส่ตอนสมัคร')} · {me.email}</p>
        </div>
        <button type="button" onClick={() => { navigator.clipboard?.writeText(me.referralCode); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="flex items-center gap-2 rounded-xl bg-lavender-soft px-3 py-2 font-mono text-sm font-extrabold tracking-widest text-primary">
          {me.referralCode}{copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </button>
      </section>

      <Button variant="danger" className="w-full" onClick={logout}><LogOut />{t('Log out', 'ออกจากระบบ')}</Button>
    </div>
  );
}

function CmuVerifyCard({ verified, cmuEmail: verifiedEmail, onVerified }: { verified: boolean; cmuEmail: string | null; onVerified: () => void }) {
  const { t } = useT();
  const [cmuEmail, setCmuEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (verified) {
    return (
      <Card id="cmu" className="flex items-center gap-3">
        <Badge><BadgeCheck />{t('CMU verified member', 'สมาชิกที่ยืนยัน CMU แล้ว')}</Badge>
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
        <h3 className="flex items-center gap-2 font-extrabold"><ShieldCheck className="size-5 text-primary" />{t('Verify you are from CMU', 'ยืนยันว่าเป็นชาว มช.')}</h3>
        <p className="text-sm text-muted-foreground">{t('Verify your @cmu.ac.th email to earn Coin from surveys and request the launch subsidy.', 'ยืนยันอีเมล @cmu.ac.th เพื่อรับเหรียญจากการตอบแบบสอบถาม และขอระบบสมทบได้')}</p>
      </div>
      {!sent ? (
        <form onSubmit={send} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1"><Input label={t('CMU email', 'อีเมล CMU')} type="email" required placeholder="firstname_l@cmu.ac.th" value={cmuEmail} onChange={(e) => setCmuEmail(e.target.value)} /></div>
          <Button disabled={loading || !cmuEmail}>{t('Send code', 'ส่งรหัสยืนยัน')}</Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <Notice>{t(`We sent a 6-digit code to ${cmuEmail}`, `ส่งรหัส 6 หลักไปที่ ${cmuEmail} แล้ว`)}</Notice>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1"><Input label={t('Verification code', 'รหัสยืนยัน')} inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></div>
            <Button disabled={loading || code.length !== 6}>{t('Verify', 'ยืนยัน')}</Button>
          </div>
        </form>
      )}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
