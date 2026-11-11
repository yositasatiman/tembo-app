import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-6 shadow-sm ring-1 ring-brand-100 ${className}`}>{children}</div>;
}

export function Button({ className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...p}
      className={`w-full rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    />
  );
}

export function Input({ label, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      <input {...p} className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100" />
    </label>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{children}</p>;
}

export function Logo() {
  return <h1 className="text-center text-3xl font-bold tracking-wide text-brand-600">TEMBO</h1>;
}

export function TopBar() {
  return (
    <header className="mb-4 flex items-center justify-between">
      <a href="/surveys" className="text-2xl font-bold tracking-wide text-brand-600">TEMBO</a>
      <nav className="flex gap-4 text-sm font-semibold text-slate-600">
        <a href="/surveys" className="hover:text-brand-600">แบบสอบถาม</a>
        <a href="/me" className="hover:text-brand-600">โปรไฟล์</a>
      </nav>
    </header>
  );
}

const STATUS: Record<string, [string, string]> = {
  OPEN: ['เปิดรับ', 'bg-emerald-100 text-emerald-700'],
  PENDING_REVIEW: ['รอแอดมินตรวจ', 'bg-amber-100 text-amber-700'],
  CLOSED: ['ปิดแล้ว', 'bg-slate-200 text-slate-600'],
};
export function StatusBadge({ status }: { status: string }) {
  const [label, cls] = STATUS[status] ?? [status, 'bg-slate-100'];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-semibold text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

export const fmtDate = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
