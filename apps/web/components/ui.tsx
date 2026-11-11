import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Target } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return <div id={id} className={cx('tembo-card p-5', className)}>{children}</div>;
}

type Variant = 'primary' | 'outline' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
  outline: 'border border-input bg-card shadow-sm hover:bg-accent hover:text-accent-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  danger: 'border border-destructive/30 text-destructive hover:bg-destructive/5',
};
export const buttonCls = (variant: Variant = 'primary', size: 'md' | 'sm' = 'md') => cx(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  size === 'md' ? 'h-11 px-5 text-sm' : 'h-9 px-4 text-sm',
  variants[variant],
);

export function Button({ className = '', variant = 'primary', size = 'md', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'sm' }) {
  return <button {...p} className={cx(buttonCls(variant, size), className)} />;
}

export const inputCls = 'w-full min-w-0 rounded-xl border border-input bg-card px-4 py-2.5 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15';

export function Input({ label, hint, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: ReactNode }) {
  return <Field label={label} hint={hint}><input {...p} className={inputCls} /></Field>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="rounded-xl bg-destructive/8 px-3 py-2 text-sm text-destructive">{children}</p>;
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'success' | 'warning'; children: ReactNode }) {
  const cls = { info: 'bg-primary-soft text-primary-deep', success: 'bg-success-soft text-success', warning: 'bg-warning-soft text-warning-foreground' }[tone];
  return <p className={cx('rounded-xl px-3 py-2 text-sm', cls)}>{children}</p>;
}

export function Logo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className="flex items-center gap-2">
      <span className={cx('flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-card', size === 'lg' ? 'size-12' : 'size-9')}>
        <Target className={size === 'lg' ? 'size-6' : 'size-5'} />
      </span>
      <span className={cx('font-display font-semibold tracking-tight text-primary-deep', size === 'lg' ? 'text-3xl' : 'text-xl')}>TEMBO</span>
    </span>
  );
}

export function Badge({ children, tone = 'soft', className = '' }: { children: ReactNode; tone?: 'soft' | 'solid' | 'success' | 'warning' | 'muted' | 'outline'; className?: string }) {
  const cls = {
    soft: 'bg-primary-soft text-primary-deep',
    solid: 'bg-primary text-primary-foreground',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning-foreground',
    muted: 'bg-muted text-muted-foreground',
    outline: 'border border-border text-muted-foreground',
  }[tone];
  return <span className={cx('inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold [&_svg]:size-3.5', cls, className)}>{children}</span>;
}

const STATUS: Record<string, [string, 'success' | 'warning' | 'muted']> = {
  OPEN: ['เปิดรับ', 'success'],
  PENDING_REVIEW: ['รอแอดมินตรวจ', 'warning'],
  CLOSED: ['ปิดแล้ว', 'muted'],
};
export function StatusBadge({ status }: { status: string }) {
  const [label, tone] = STATUS[status] ?? [status, 'muted'];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Progress({ value, className = '' }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} className={cx('h-2 w-full overflow-hidden rounded-full bg-primary/20', className)}>
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Avatar({ name, size = 'md' }: { name?: string | null; size?: 'sm' | 'md' }) {
  const initials = (name ?? '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className={cx('flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground', size === 'sm' ? 'size-9 text-sm' : 'size-12')}>
      {initials || '?'}
    </span>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label = 'กำลังโหลด…' }: { label?: string }) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{label}</p>;
}

export const fmtDate = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
export const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
export const yearLabel = (y: number | null) => (y === 7 ? 'บัณฑิตศึกษา' : y ? `ปี ${y}` : '');
