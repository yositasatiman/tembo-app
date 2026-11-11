'use client';
import type { AnswerValue, Question } from '@tembo/shared';
import { QUESTION_RULES } from '@tembo/shared';
import { cx, inputCls } from '../ui';

/** ช่องตอบ 1 ข้อ ตามชนิดคำถาม */
export function AnswerField({ q, value, onChange, disabled }: { q: Question; value: AnswerValue | undefined; onChange: (v: AnswerValue | undefined) => void; disabled?: boolean }) {
  if (q.type === 'SINGLE_CHOICE' || q.type === 'MULTI_CHOICE') {
    const multi = q.type === 'MULTI_CHOICE';
    const selected = multi ? ((value as number[] | undefined) ?? []) : value;
    return (
      <div className="space-y-2">
        {q.options.map((o, i) => {
          const on = multi ? (selected as number[]).includes(i) : selected === i;
          return (
            <label key={i} className={cx('flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition',
              on ? 'border-primary bg-primary-soft/60' : 'border-border hover:border-primary/50')}>
              <input type={multi ? 'checkbox' : 'radio'} name={q.id} className="accent-primary" disabled={disabled} checked={on}
                onChange={() => {
                  if (!multi) return onChange(i);
                  const arr = selected as number[];
                  const next = on ? arr.filter((x) => x !== i) : [...arr, i];
                  onChange(next.length ? next : undefined);
                }} />
              {o}
            </label>
          );
        })}
        {multi && <p className="text-xs text-muted-foreground">เลือกได้มากกว่า 1 ข้อ</p>}
      </div>
    );
  }
  if (q.type === 'SCALE') {
    const max = q.scaleMax ?? 5;
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
            <button type="button" key={n} disabled={disabled} onClick={() => onChange(n)} aria-pressed={value === n}
              className={cx('size-11 rounded-xl border text-sm font-semibold transition',
                value === n ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary')}>{n}</button>
          ))}
        </div>
        {(q.minLabel || q.maxLabel) && (
          <div className="flex justify-between text-xs text-muted-foreground" style={{ maxWidth: `${max * 3.25}rem` }}>
            <span>1 = {q.minLabel}</span><span>{max} = {q.maxLabel}</span>
          </div>
        )}
      </div>
    );
  }
  const long = q.type === 'LONG_TEXT';
  const max = long ? QUESTION_RULES.LONG_TEXT_MAX : QUESTION_RULES.SHORT_TEXT_MAX;
  const props = {
    className: inputCls, maxLength: max, disabled, value: (value as string | undefined) ?? '',
    onChange: (e: { target: { value: string } }) => onChange(e.target.value || undefined),
    placeholder: 'พิมพ์คำตอบ',
  };
  return long ? <textarea rows={4} {...props} /> : <input {...props} />;
}
