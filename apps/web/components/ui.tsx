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
