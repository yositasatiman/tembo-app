'use client';
import { createContext, FormEvent, ReactNode, Suspense, useCallback, useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  BadgeCheck, ClipboardList, Coins, LayoutGrid, LogOut, PenSquare, Search, ShieldCheck, Sparkles, Ticket,
} from 'lucide-react';
import type { MeResponse } from '@tembo/shared';
import { getMe, post } from '@/lib/api';
import { Avatar, Badge, cx, Logo, Progress, Spinner, yearLabel } from './ui';

interface MeCtx { me: MeResponse; reload: () => Promise<void> }
const Ctx = createContext<MeCtx | null>(null);
export function useMe() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useMe must be used inside <AppShell>');
  return c;
}

const NAV = [
  { href: '/surveys', label: 'ฟีดทั้งหมด', icon: LayoutGrid, match: (p: string, tab: string | null) => p === '/surveys' && tab !== 'mine' },
  { href: '/surveys?tab=mine', label: 'แบบสอบถามของฉัน', icon: ClipboardList, match: (p: string, tab: string | null) => p === '/surveys' && tab === 'mine' },
  { href: '/surveys/new', label: 'โพสต์แบบสอบถาม', icon: PenSquare, match: (p: string) => p === '/surveys/new' },
  { href: '/events', label: 'Event ในมหาวิทยาลัย', icon: Ticket, match: (p: string) => p.startsWith('/events'), soon: true },
];

/** โครงหน้าหลัก: แถบบน + แถบซ้าย (เมนู, การ์ดโปรไฟล์, กิจกรรมของฉัน) ตามดีไซน์ */
export function AppShell(props: { children: ReactNode; requireOnboarded?: boolean }) {
  return <Suspense fallback={<Spinner />}><Shell {...props} /></Suspense>;
}

function Shell({ children, requireOnboarded = true }: { children: ReactNode; requireOnboarded?: boolean }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const reload = useCallback(async () => {
    try {
      const m = await getMe();
      if (requireOnboarded && !m.onboarded) { router.replace('/onboarding'); return; }
      setMe(m);
    } catch { router.replace('/login'); }
  }, [router, requireOnboarded]);
  useEffect(() => { reload(); }, [reload]);

  if (!me) return <Spinner />;
  return (
    <Ctx.Provider value={{ me, reload }}>
      <Header me={me} />
      <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <Sidebar me={me} />
          <div className="min-w-0 space-y-6">
            <MobileNav />
            {children}
          </div>
        </div>
      </div>
    </Ctx.Provider>
  );
}

function Header({ me }: { me: MeResponse }) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  function search(e: FormEvent) {
    e.preventDefault();
    router.push(q.trim() ? `/surveys?q=${encodeURIComponent(q.trim())}` : '/surveys');
  }
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-card/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 lg:gap-6 lg:px-8">
        <Link href="/surveys" className="shrink-0"><Logo /></Link>
        <form onSubmit={search} className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="ค้นหาแบบสอบถาม"
            placeholder="ค้นหาแบบสอบถาม…"
            className="h-10 w-full rounded-xl border border-border bg-muted/60 pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus:bg-card focus:ring-1 focus:ring-primary" />
        </form>
        <Link href="/me" className="flex shrink-0 items-center gap-2 rounded-xl px-2 py-1 hover:bg-accent">
          <span className="hidden items-center gap-1 rounded-full bg-primary-soft px-2.5 py-1 text-sm font-semibold text-primary-deep sm:flex">
            <Coins className="size-4" />{me.balance.toLocaleString()}
          </span>
          <Avatar name={me.displayName} size="sm" />
          <span className="hidden text-left leading-tight md:block">
            <span className="block text-sm font-semibold">{me.displayName}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {me.cmuVerified ? <><BadgeCheck className="size-3.5 text-primary" />{me.cmuEmail}</> : me.email}
            </span>
          </span>
        </Link>
      </div>
    </header>
  );
}

function NavItems({ compact = false }: { compact?: boolean }) {
  const path = usePathname();
  const tab = useSearchParams().get('tab');
  return NAV.map(({ href, label, icon: Icon, match, soon }) => {
    const active = match(path, tab);
    if (compact) {
      return (
        <Link key={href} href={href} className={cx('rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
          active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}>{label}</Link>
      );
    }
    return (
      <Link key={href} href={href} className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
        active ? 'bg-primary text-primary-foreground shadow-card' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground')}>
        <Icon className="size-4" />{label}
        {soon && <span className={cx('ml-auto text-[10px]', active ? 'opacity-80' : 'text-muted-foreground')}>เร็ว ๆ นี้</span>}
      </Link>
    );
  });
}

function MobileNav() {
  return <div className="flex flex-wrap gap-2 lg:hidden"><NavItems compact /></div>;
}

/** ความครบของโปรไฟล์: ชื่อ คณะ ชั้นปี ความสนใจ ยืนยัน CMU */
function completeness(me: MeResponse) {
  const parts = [!!me.displayName, !!me.faculty, !!me.studyYear, me.interests.length > 0, me.cmuVerified];
  return Math.round((parts.filter(Boolean).length / parts.length) * 100);
}

function Sidebar({ me }: { me: MeResponse }) {
  const router = useRouter();
  const pct = completeness(me);
  async function logout() {
    await post('/auth/logout').catch(() => undefined);
    router.replace('/login');
  }
  return (
    <aside className="hidden space-y-4 lg:sticky lg:top-20 lg:block lg:self-start">
      <nav className="tembo-card space-y-0.5 p-2" aria-label="เมนู"><NavItems /></nav>

      <div className="tembo-card p-5">
        <div className="flex items-center gap-3">
          <Avatar name={me.displayName} />
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-semibold">{me.displayName}</p>
            <p className="truncate text-xs text-muted-foreground">{me.faculty} · {yearLabel(me.studyYear)}</p>
          </div>
        </div>
        {me.cmuVerified
          ? <Badge className="mt-4"><BadgeCheck />สมาชิกที่ยืนยัน CMU แล้ว</Badge>
          : <Link href="/me#cmu" className="mt-4 inline-flex"><Badge tone="warning"><ShieldCheck />ยืนยันอีเมล @cmu.ac.th</Badge></Link>}
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">ความครบของโปรไฟล์</span>
            <span className="font-semibold text-primary">{pct}%</span>
          </div>
          <Progress value={pct} />
          {pct < 100 && <p className="text-[11px] text-muted-foreground">{me.cmuVerified ? 'เพิ่มข้อมูลโปรไฟล์ให้ครบเพื่อการจับคู่ที่แม่นขึ้น' : 'ยืนยันอีเมล CMU เพื่อรับ Coin จากการตอบแบบสอบถาม'}</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {me.interests.map((i) => <span key={i} className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{i}</span>)}
        </div>
      </div>

      <div className="tembo-card space-y-3 p-5">
        <p className="font-display text-sm font-semibold">กิจกรรมของฉัน</p>
        <Stat icon={<Coins />} label="Coin คงเหลือ" value={me.balance.toLocaleString()} />
        <Stat icon={<Sparkles />} label="ตอบแบบสอบถามแล้ว" value={me.stats.responses} />
        <Stat icon={<ClipboardList />} label="แบบสอบถามที่โพสต์" value={me.stats.surveysPosted} />
        <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
          {me.role === 'ADMIN' ? <Link href="/admin" className="font-semibold text-primary hover:underline">หน้าแอดมิน</Link> : <span />}
          <button onClick={logout} className="flex items-center gap-1 text-muted-foreground hover:text-foreground"><LogOut className="size-3.5" />ออกจากระบบ</button>
        </div>
      </div>
    </aside>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="flex size-8 items-center justify-center rounded-xl bg-accent text-accent-foreground [&_svg]:size-4">{icon}</span>
      <span className="flex-1 text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
