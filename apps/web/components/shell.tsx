'use client';
import { createContext, FormEvent, ReactNode, Suspense, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  BadgeCheck, Bell, CalendarDays, Check, ChevronRight, ClipboardList, Coins, FileText, Gift, Home, Languages, LogOut, Menu, Search,
  ShieldAlert, ShieldCheck, Ticket, UserRound,
} from 'lucide-react';
import { facultyLabel, type Lang, type MeResponse } from '@tembo/shared';
import { useT } from '@/lib/i18n';
import { api, getMe, post } from '@/lib/api';
import { Avatar, cx, Spinner, yearLabel } from './ui';

interface MeCtx { me: MeResponse; reload: () => Promise<void> }
const Ctx = createContext<MeCtx | null>(null);
export function useMe() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useMe must be used inside <AppShell>');
  return c;
}

/** โครงหน้าหลักตาม Figma: แถบบน (เมนู · TEMBO · ค้นหา · โปรไฟล์) + เนื้อหาคอลัมน์เดียว */
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
      <main className="mx-auto max-w-2xl px-5 pt-4 pb-16">{children}</main>
    </Ctx.Provider>
  );
}

// ───────────── เมนู ─────────────

const MAIN_NAV = [
  { href: '/feed', en: 'Feed', th: 'ฟีด', icon: Home, match: (p: string) => p === '/feed' },
  { href: '/surveys', en: 'Surveys', th: 'แบบสอบถาม', icon: FileText, match: (p: string) => p.startsWith('/surveys') },
  { href: '/events', en: 'Events', th: 'กิจกรรม', icon: CalendarDays, match: (p: string) => p.startsWith('/events') },
];
const MORE_NAV = [
  { href: '/notifications', en: 'Notifications', th: 'แจ้งเตือน', icon: Bell, match: (p: string) => p.startsWith('/notifications') },
  { href: '/coin', en: 'Coin', th: 'เหรียญ', icon: Coins, match: (p: string) => p.startsWith('/coin') },
  { href: '/rewards', en: 'Rewards', th: 'ร้านรางวัล', icon: Gift, match: (p: string) => p.startsWith('/rewards') },
  { href: '/me', en: 'Profile', th: 'โปรไฟล์', icon: UserRound, match: (p: string) => p === '/me' },
];

/** ปิด popover เมื่อคลิกข้างนอก / กด Esc / เปลี่ยนหน้า */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = usePathname();
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return { open, setOpen, ref };
}

function MenuItem({ href, label, icon: Icon, active, onClick }: { href?: string; label: string; icon: typeof Home; active?: boolean; onClick?: () => void }) {
  const cls = cx('flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[15px] font-bold transition-colors',
    active ? 'bg-lavender-soft text-primary' : 'text-indigo hover:bg-lavender-soft');
  const inner = <><Icon className={cx('size-5', active ? 'text-primary' : 'text-muted-foreground')} /><span className="flex-1 text-left">{label}</span><ChevronRight className="size-[18px] text-muted-foreground" /></>;
  return href ? <Link href={href} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

/** Figma: TEMBO / More menu (+ เปลี่ยนภาษา) */
function MoreMenu({ isAdmin }: { isAdmin: boolean }) {
  const { open, setOpen, ref } = usePopover();
  const path = usePathname();
  const { t } = useT();
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={t('Menu', 'เมนู')} aria-expanded={open} onClick={() => setOpen(!open)}
        className="flex size-10 items-center justify-center rounded-xl text-indigo hover:bg-lavender-soft"><Menu className="size-6" /></button>
      {open && (
        <nav aria-label={t('Main menu', 'เมนูหลัก')} className="absolute top-12 left-0 z-50 w-[280px] space-y-0.5 rounded-2xl bg-card p-2 shadow-float">
          {MAIN_NAV.map((n) => <MenuItem key={n.href} href={n.href} icon={n.icon} label={t(n.en, n.th)} active={n.match(path)} />)}
          <hr className="mx-3 my-1.5 border-border" />
          {MORE_NAV.map((n) => <MenuItem key={n.href} href={n.href} icon={n.icon} label={t(n.en, n.th)} active={n.match(path)} />)}
          {isAdmin && <MenuItem href="/admin" label={t('Admin', 'แอดมิน')} icon={ShieldCheck} active={path === '/admin'} />}
          <hr className="mx-3 my-1.5 border-border" />
          <LanguageSwitch />
        </nav>
      )}
    </div>
  );
}

/** เปลี่ยนภาษาทั้งเว็บ (จำไว้ใน cookie — API ใช้ภาษาเดียวกัน) */
export function LanguageSwitch({ compact }: { compact?: boolean }) {
  const { t, lang, setLang } = useT();
  const opts: { v: Lang; label: string }[] = [{ v: 'en', label: 'English' }, { v: 'th', label: 'ภาษาไทย' }];
  return (
    <div className={compact ? '' : 'px-3 py-1.5'}>
      {!compact && <p className="mb-1.5 flex items-center gap-2 text-xs font-bold text-muted-foreground"><Languages className="size-4" />{t('Language', 'ภาษา')}</p>}
      <div role="radiogroup" aria-label={t('Language', 'ภาษา')} className="grid grid-cols-2 gap-1 rounded-xl bg-lavender-soft p-1">
        {opts.map((o) => (
          <button key={o.v} type="button" role="radio" aria-checked={lang === o.v} lang={o.v} onClick={() => setLang(o.v)}
            className={cx('flex h-9 items-center justify-center gap-1 rounded-lg text-[13px] font-bold transition-colors',
              lang === o.v ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-indigo')}>
            {lang === o.v && <Check className="size-3.5" />}{o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Figma: TEMBO / Avatar account menu */
function AccountMenu({ me }: { me: MeResponse }) {
  const { open, setOpen, ref } = usePopover();
  const router = useRouter();
  const { t, p, lang } = useT();
  async function logout() {
    await post('/auth/logout').catch(() => undefined);
    router.replace('/login');
  }
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-label={t('My account', 'บัญชีของฉัน')} aria-expanded={open} onClick={() => setOpen(!open)} className="rounded-full ring-primary/30 hover:ring-4">
        <Avatar name={me.displayName} size="sm" />
      </button>
      {open && (
        <div className="absolute top-12 right-0 z-50 w-[300px] rounded-2xl bg-card p-2.5 shadow-float">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar name={me.displayName} />
            <div className="min-w-0 leading-tight">
              <p className="truncate font-extrabold">{me.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{me.faculty ? p(facultyLabel(me.faculty)) : ''} · {yearLabel(me.studyYear, lang)}</p>
              {me.cmuVerified
                ? <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-success"><BadgeCheck className="size-3.5" />{t('Verified CMU student', 'ยืนยันนักศึกษา มช. แล้ว')}</p>
                : <Link href="/me#cmu" className="mt-1 flex items-center gap-1 text-[11px] font-bold text-warning-foreground"><ShieldAlert className="size-3.5" />{t('@cmu.ac.th email not verified', 'ยังไม่ยืนยันอีเมล @cmu.ac.th')}</Link>}
            </div>
          </div>
          <hr className="mx-2 my-1.5 border-border" />
          <MenuItem href="/me" label={t('Profile', 'โปรไฟล์')} icon={UserRound} />
          <MenuItem href="/coin" label={`Coin · ${me.balance.toLocaleString()}`} icon={Coins} />
          <MenuItem href="/surveys?filter=mine" label={t('My surveys', 'แบบสอบถามของฉัน')} icon={ClipboardList} />
          <MenuItem href="/events?filter=mine" label={t('My events', 'กิจกรรมของฉัน')} icon={Ticket} />
          {me.role === 'ADMIN' && <MenuItem href="/admin" label={t('Admin', 'แอดมิน')} icon={ShieldCheck} />}
          <hr className="mx-2 my-1.5 border-border" />
          <MenuItem label={t('Log out', 'ออกจากระบบ')} icon={LogOut} onClick={logout} />
        </div>
      )}
    </div>
  );
}

function Header({ me }: { me: MeResponse }) {
  const router = useRouter();
  const { t } = useT();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  function search(e: FormEvent) {
    e.preventDefault();
    router.push(q.trim() ? `/feed?q=${encodeURIComponent(q.trim())}` : '/feed');
  }
  return (
    <header className="sticky top-0 z-40 bg-card/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[58px] max-w-2xl items-center gap-2 px-3 sm:px-5">
        <MoreMenu isAdmin={me.role === 'ADMIN'} />
        <Link href="/feed" className="text-xl font-extrabold tracking-tight text-indigo">TEMBO</Link>
        <form onSubmit={search} role="search" className="relative ml-auto min-w-0 flex-1 sm:max-w-[320px]">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-5 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('Search', 'ค้นหา')} placeholder={t('Search', 'ค้นหา')}
            className="h-[34px] w-full rounded-2xl border border-border/50 bg-[#e8e3f2]/50 pr-3 pl-9 text-[15px] outline-none placeholder:text-muted-foreground focus:border-primary focus:bg-card" />
        </form>
        <NotificationBell />
        <AccountMenu me={me} />
      </div>
    </header>
  );
}

/** กระดิ่งพร้อมจำนวนที่ยังไม่อ่าน — โหลดใหม่ทุก 60 วินาที, เมื่อเปลี่ยนหน้า และเมื่อหน้าแจ้งเตือนอ่านแล้ว */
function NotificationBell() {
  const path = usePathname();
  const { t } = useT();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => api<{ unread: number }>('/notifications/unread-count').then((r) => alive && setUnread(r.unread)).catch(() => undefined);
    load();
    const t = setInterval(load, 60_000);
    const onRead = (e: Event) => setUnread((e as CustomEvent<number>).detail);
    window.addEventListener('tembo:unread', onRead);
    return () => { alive = false; clearInterval(t); window.removeEventListener('tembo:unread', onRead); };
  }, [path]);
  return (
    <Link href="/notifications" aria-label={unread ? t(`Notifications, ${unread} unread`, `แจ้งเตือน ยังไม่อ่าน ${unread} รายการ`) : t('Notifications', 'แจ้งเตือน')}
      className="relative flex size-10 shrink-0 items-center justify-center rounded-xl text-indigo hover:bg-lavender-soft">
      <Bell className="size-5" />
      {unread > 0 && <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-extrabold text-white">{unread > 99 ? '99+' : unread}</span>}
    </Link>
  );
}

/** แจ้งให้กระดิ่งอัปเดตจำนวนที่ยังไม่อ่าน */
export const announceUnread = (n: number) => window.dispatchEvent(new CustomEvent('tembo:unread', { detail: n }));

// ───────────── แท็บฟีด (ใช้ทั้งหน้า ฟีด / แบบสอบถาม / Event) ─────────────

const FEED_TABS = [
  { key: 'all', en: 'All', th: 'ทั้งหมด', href: '/feed' },
  { key: 'foryou', en: 'Your Feed', th: 'ฟีดของคุณ', href: '/feed?tab=foryou' },
  { key: 'survey', en: 'Survey', th: 'แบบสอบถาม', href: '/surveys' },
  { key: 'event', en: 'Event', th: 'กิจกรรม', href: '/events' },
] as const;

/** Figma: Feed tabs — แท็บที่เลือกพื้นน้ำเงินเข้ม */
export function FeedTabs({ active }: { active: (typeof FEED_TABS)[number]['key'] }) {
  const { t: tr } = useT();
  return (
    <nav aria-label={tr('Feed type', 'ประเภทฟีด')} className="-mx-5 flex gap-[7px] overflow-x-auto px-5 pb-0.5">
      {FEED_TABS.map((t) => (
        <Link key={t.key} href={t.href} aria-current={active === t.key ? 'page' : undefined}
          className={cx('shrink-0 rounded-full px-3 py-2 text-xs font-bold whitespace-nowrap',
            active === t.key ? 'bg-indigo text-white' : 'bg-card text-muted-foreground hover:text-indigo')}>{tr(t.en, t.th)}</Link>
      ))}
    </nav>
  );
}

/** หัวหน้า: ชื่อ + ปุ่มสร้าง + Coin (Figma: Results heading) */
export function PageHeading({ title, subtitle, create }: { title: string; subtitle?: string; create?: { href: string; label: string } }) {
  const { me } = useMe();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 truncate text-[22px] font-extrabold tracking-tight">{title}</h1>
        <div className="flex shrink-0 items-center gap-2">
          {create && <Link href={create.href} className="rounded-full bg-primary px-3 py-2 text-[13px] font-bold text-white hover:bg-primary/90">{create.label} +</Link>}
          <Link href="/coin" className="flex items-center gap-1 rounded-full bg-coin-soft px-3 py-2 text-[13px] font-bold"><Coins className="size-4 text-warning" />{me.balance.toLocaleString()}</Link>
        </div>
      </div>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}
