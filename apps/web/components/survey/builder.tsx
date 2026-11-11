'use client';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { isChoice, QUESTION_RULES, QUESTION_TYPE_LABEL, QUESTION_TYPES, SURVEY_RULES, type QuestionInput, type QuestionType } from '@tembo/shared';
import { Button, cx, inputCls } from '../ui';

export const newQuestion = (type: QuestionType = 'SINGLE_CHOICE'): QuestionInput => ({
  type, title: '', required: true,
  options: isChoice(type) ? ['ตัวเลือกที่ 1', 'ตัวเลือกที่ 2'] : [],
  ...(type === 'SCALE' ? { scaleMax: 5, minLabel: 'น้อยที่สุด', maxLabel: 'มากที่สุด' } : {}),
});

/** ตัวสร้างคำถาม: เพิ่ม/ลบ/สลับลำดับ เปลี่ยนชนิด และแก้ตัวเลือก */
export function QuestionBuilder({ value, onChange }: { value: QuestionInput[]; onChange: (q: QuestionInput[]) => void }) {
  const set = (i: number, patch: Partial<QuestionInput>) => onChange(value.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...value];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  const changeType = (i: number, type: QuestionType) => {
    const fresh = newQuestion(type);
    const q = value[i];
    set(i, { ...fresh, title: q.title, required: q.required, options: isChoice(type) && isChoice(q.type) ? q.options : fresh.options });
  };

  return (
    <div className="space-y-3">
      {value.map((q, i) => (
        <div key={i} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <span className="mt-2 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-xs font-semibold text-primary-deep">{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className={inputCls} placeholder="พิมพ์คำถาม" maxLength={300} value={q.title} onChange={(e) => set(i, { title: e.target.value })} />
                <select className={cx(inputCls, 'sm:w-48')} value={q.type} onChange={(e) => changeType(i, e.target.value as QuestionType)}>
                  {QUESTION_TYPES.map((t) => <option key={t} value={t}>{QUESTION_TYPE_LABEL[t]}</option>)}
                </select>
              </div>

              {isChoice(q.type) && (
                <div className="space-y-2">
                  {q.options.map((o, k) => (
                    <div key={k} className="flex items-center gap-2">
                      <span className={cx('size-4 shrink-0 border-2 border-input', q.type === 'SINGLE_CHOICE' ? 'rounded-full' : 'rounded')} />
                      <input className={inputCls} value={o} maxLength={200} onChange={(e) => set(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} />
                      <button type="button" aria-label="ลบตัวเลือก" disabled={q.options.length <= 2}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-30"
                        onClick={() => set(i, { options: q.options.filter((_, m) => m !== k) })}><X className="size-4" /></button>
                    </div>
                  ))}
                  {q.options.length < QUESTION_RULES.MAX_OPTIONS && (
                    <button type="button" className="text-sm font-medium text-primary hover:underline"
                      onClick={() => set(i, { options: [...q.options, `ตัวเลือกที่ ${q.options.length + 1}`] })}>+ เพิ่มตัวเลือก</button>
                  )}
                </div>
              )}

              {q.type === 'SCALE' && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <select className={inputCls} value={q.scaleMax} onChange={(e) => set(i, { scaleMax: Number(e.target.value) })}>
                    {QUESTION_RULES.SCALES.map((n) => <option key={n} value={n}>1–{n} คะแนน</option>)}
                  </select>
                  <input className={inputCls} placeholder="ป้ายคะแนนต่ำ" maxLength={50} value={q.minLabel ?? ''} onChange={(e) => set(i, { minLabel: e.target.value })} />
                  <input className={inputCls} placeholder="ป้ายคะแนนสูง" maxLength={50} value={q.maxLabel ?? ''} onChange={(e) => set(i, { maxLabel: e.target.value })} />
                </div>
              )}
              {(q.type === 'SHORT_TEXT' || q.type === 'LONG_TEXT') && (
                <p className="text-xs text-muted-foreground">ผู้ตอบพิมพ์ได้ไม่เกิน {q.type === 'SHORT_TEXT' ? QUESTION_RULES.SHORT_TEXT_MAX : QUESTION_RULES.LONG_TEXT_MAX} ตัวอักษร</p>
              )}

              <div className="flex items-center justify-between border-t border-border pt-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-primary" checked={q.required} onChange={(e) => set(i, { required: e.target.checked })} />ต้องตอบ
                </label>
                <div className="flex gap-1 text-muted-foreground">
                  <IconBtn label="เลื่อนขึ้น" disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp /></IconBtn>
                  <IconBtn label="เลื่อนลง" disabled={i === value.length - 1} onClick={() => move(i, 1)}><ArrowDown /></IconBtn>
                  <IconBtn label="ลบคำถาม" disabled={value.length === 1} onClick={() => onChange(value.filter((_, j) => j !== i))}><Trash2 /></IconBtn>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
      {value.length < SURVEY_RULES.MAX_QUESTIONS && (
        <Button type="button" variant="outline" className="w-full" onClick={() => onChange([...value, newQuestion()])}><Plus />เพิ่มคำถาม</Button>
      )}
    </div>
  );
}

function IconBtn({ label, children, ...p }: { label: string; children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} {...p} className="rounded-lg p-1.5 hover:bg-muted disabled:opacity-30 [&_svg]:size-4">{children}</button>;
}
