'use client';
import { KeyboardEvent, ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Calendar, Check, ChevronDown, CircleAlert } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { cx } from './ui';

/** ดอกจันสีแดงของช่องที่ต้องกรอก */
export const Req = () => <span aria-hidden className="ml-0.5 text-destructive">*</span>;

/** ข้อความเตือนใต้ช่อง (Figma: Field error — circle-alert + ตัวแดง) */
export function FieldError({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="flex items-center gap-1 text-[11px] font-semibold text-destructive">
      <CircleAlert className="size-3.5 shrink-0" />{children}
    </p>
  );
}

/** สรุปข้อผิดพลาดรวมกล่องเดียว (Figma: Validation summary) */
export function ErrorSummary({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div role="alert" className="rounded-2xl border border-destructive/25 bg-destructive-soft px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-destructive"><CircleAlert className="size-4 shrink-0" />{title}</p>
      <p className="mt-0.5 pl-[22px] text-xs leading-relaxed text-destructive/90">{items.join(' · ')}</p>
    </div>
  );
}

/** กรอบช่องกรอกตาม Figma (สูง 48, มุม 14, เส้นม่วงอ่อน → แดงเมื่อผิด) */
export const fieldBox = (invalid?: boolean) => cx(
  'flex h-12 w-full items-center gap-2 rounded-[14px] border-[1.2px] bg-card px-[13px] text-[13px] text-indigo transition-colors',
  invalid ? 'border-destructive bg-destructive-soft/40 focus-within:border-destructive' : 'border-[#ddd4f7] focus-within:border-primary',
);
export const bareInput = 'min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground';

export interface SelectOption<V extends string | number> { value: V; label: string }

/**
 * Dropdown แบบกำหนดเอง (แทน <select> ของเบราว์เซอร์ที่ตัวหนังสือชิดขอบและหน้าตาไม่เข้ากับดีไซน์)
 * คีย์บอร์ด: ↑ ↓ เลือก, Enter/Space ยืนยัน, Esc ปิด
 */
export function Select<V extends string | number>({ value, options, onChange, icon, placeholder, invalid, label, describedBy }: {
  value: V | null; options: SelectOption<V>[]; onChange: (v: V) => void; icon?: ReactNode; placeholder: string;
  invalid?: boolean; label: string; describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, options, value]);

  function choose(i: number) { onChange(options[i].value); setOpen(false); }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length);
    }
    if ((e.key === 'Enter' || e.key === ' ') && open) { e.preventDefault(); choose(active); }
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId} aria-invalid={invalid || undefined}
        aria-describedby={describedBy} onClick={() => setOpen(!open)} onKeyDown={onKey}
        className={cx(fieldBox(invalid), 'text-left focus:outline-none', open && !invalid && 'border-primary')}>
        {icon && <span className="shrink-0 text-primary [&_svg]:size-[17px]">{icon}</span>}
        <span className={cx('min-w-0 flex-1 truncate', !current && 'text-muted-foreground')}>{current?.label ?? placeholder}</span>
        <ChevronDown className={cx('size-4 shrink-0 text-indigo transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-label={label}
          className="absolute top-[calc(100%+6px)] left-0 z-30 max-h-72 w-full min-w-[200px] overflow-auto rounded-2xl border border-[#ece6fb] bg-card p-1.5 shadow-float">
          {options.map((o, i) => {
            const selected = o.value === value;
            return (
              <li key={String(o.value)} role="option" aria-selected={selected}
                onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); choose(i); }}
                className={cx('flex h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-[13px] transition-colors',
                  selected ? 'bg-lavender-soft font-bold text-primary' : 'text-indigo', i === active && !selected && 'bg-lavender-soft/60')}>
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {selected && <Check className="size-4 shrink-0" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const isoToDMY = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
function dmyToIso(dmy: string) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dmy);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(`${iso}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d.getDate() === Number(m[1]) && d.getMonth() + 1 === Number(m[2]) ? iso : null;
}

/** วันที่แบบ dd/mm/yyyy: พิมพ์เองได้ หรือกดไอคอนปฏิทินเพื่อเลือก — ค่าที่ส่งออกเป็น YYYY-MM-DD ('' = ยังไม่ครบ/ไม่ถูกต้อง) */
export function DateField({ value, onChange, min, invalid, label, describedBy }: {
  value: string; onChange: (iso: string) => void; min?: string; invalid?: boolean; label: string; describedBy?: string;
}) {
  const { t } = useT();
  const [text, setText] = useState(isoToDMY(value));
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => { if (dmyToIso(text) !== value) setText(isoToDMY(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function type(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    const masked = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
    setText(masked);
    onChange(dmyToIso(masked) ?? '');
  }
  return (
    <div className={cx(fieldBox(invalid), 'relative')}>
      <button type="button" aria-label={t('Open calendar', 'เปิดปฏิทิน')} onClick={() => { try { picker.current?.showPicker(); } catch { picker.current?.focus(); } }}
        className="shrink-0 text-muted-foreground hover:text-primary"><Calendar className="size-[17px]" /></button>
      <input aria-label={label} aria-invalid={invalid || undefined} aria-describedby={describedBy} inputMode="numeric" placeholder="dd/mm/yyyy"
        value={text} onChange={(e) => type(e.target.value)} onFocus={(e) => e.currentTarget.select()} className={bareInput} />
      <input ref={picker} type="date" tabIndex={-1} aria-hidden min={min} value={value}
        onChange={(e) => { setText(isoToDMY(e.target.value)); onChange(e.target.value); }}
        className="pointer-events-none absolute inset-0 opacity-0" />
    </div>
  );
}
