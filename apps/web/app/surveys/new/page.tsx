'use client';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight, Calendar, Check, CheckCircle2, ChevronDown, Clock3, Coins, Gift, Globe2, Link2, Minus, Plus, Send, Shapes,
  ShieldCheck, Tag, UserCheck, Users, X,
} from 'lucide-react';
import {
  DRAW_RULES, EST_MINUTES, estMinutesLabel, FACULTIES, INTERESTS, parseGoogleFormPrefill, PREFILL_PLACEHOLDER, quoteSurvey,
  REWARD_MODE_LABEL, STUDY_YEARS, SURVEY_CATEGORIES, SURVEY_RULES, surveyBand,
  type RewardMode, type SurveyCategory, type SurveyDetail, type SurveyQuoteResponse,
} from '@tembo/shared';
import { api, post } from '@/lib/api';
import { AppShell, useMe } from '@/components/shell';
import { Button, cx, ErrorText, Modal, Spinner } from '@/components/ui';

export default function NewSurveyPage() {
  return <AppShell><CreateSurvey /></AppShell>;
}

const DRAFT_KEY = 'tembo:survey-draft:v1';
const STEPS = ['ข้อมูล', 'ลิงก์', 'ผู้ตอบ', 'ตรวจทาน'] as const;

interface Draft {
  title: string; description: string; category: SurveyCategory | ''; tags: string[]; estMinutes: number | 0; closesOn: string;
  quota: number; rewardMode: RewardMode; reward: number; prizes: number[];
  formUrl: string; questionCount: number;
  limitFaculty: boolean; faculties: string[]; limitYear: boolean; years: number[];
  requestSubsidy: boolean;
  /** EQUAL: ลง Coin เอง (ที่เหลือให้เพื่อนช่วยสนับสนุน) — null = ลงเต็มเท่าที่มี */
  contribution: number | null;
}

const dateInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const blank = (): Draft => ({
  title: '', description: '', category: '', tags: [], estMinutes: 0, closesOn: dateInput(new Date(Date.now() + 14 * 86_400_000)),
  quota: 50, rewardMode: 'EQUAL', reward: 5, prizes: [50, 30, 20],
  formUrl: '', questionCount: 10,
  limitFaculty: false, faculties: [], limitYear: false, years: [],
  requestSubsidy: false, contribution: null,
});
/** ปิดรับสิ้นวันที่เลือก (เวลาเครื่องผู้ใช้) */
const closesAtOf = (d: Draft) => new Date(`${d.closesOn}T23:59:00`);
const thaiDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });

function readDraft(): Draft | null {
  try { const raw = localStorage.getItem(DRAFT_KEY); return raw ? { ...blank(), ...JSON.parse(raw) } : null; } catch { return null; }
}

/** Figma: SURVEY / Create Information → External Link → Eligibility → Preview */
function CreateSurvey() {
  const router = useRouter();
  const { me } = useMe();
  const [info, setInfo] = useState<SurveyQuoteResponse | null>(null);
  const [d, setD] = useState<Draft>(blank);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<SurveyDetail | null>(null);

  useEffect(() => {
    api<SurveyQuoteResponse>('/surveys/quote').then(setInfo).catch(() => undefined);
    const saved = readDraft();
    if (saved) { setD(saved); setNotice('เปิดฉบับร่างที่บันทึกไว้'); }
  }, []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD((x) => ({ ...x, [k]: v })); setErrors([]); };
  const band = surveyBand(d.questionCount);
  const draw = d.rewardMode === 'DRAW';
  const q = useMemo(() => info && quoteSurvey({
    questionCount: d.questionCount, rewardPerResponse: draw ? Math.max(0, ...d.prizes) : d.reward, quota: d.quota,
    isFirstPost: info.isFirstPost, withSubsidy: d.requestSubsidy, prizes: draw ? d.prizes : undefined,
  }), [info, d, draw]);
  const prefill = parseGoogleFormPrefill(d.formUrl);

  /** ข้อผิดพลาดของแต่ละขั้น (ฝั่งเว็บ — API ตรวจซ้ำอีกครั้ง) */
  function check(s: number): string[] {
    const e: string[] = [];
    if (s === 0) {
      if (d.title.trim().length < 3) e.push('ใส่ชื่อแบบสอบถามอย่างน้อย 3 ตัวอักษร');
      if (!d.description.trim()) e.push('ใส่รายละเอียด');
      if (!d.category) e.push('เลือกหมวดหมู่');
      if (!d.estMinutes) e.push('เลือกเวลาทำโดยประมาณ');
      const c = closesAtOf(d).getTime();
      if (!(c > Date.now() + 3_600_000)) e.push('วันปิดรับต้องเป็นวันนี้หรือหลังจากนี้');
      if (c > Date.now() + SURVEY_RULES.MAX_DURATION_DAYS * 86_400_000) e.push(`เปิดรับได้ไม่เกิน ${SURVEY_RULES.MAX_DURATION_DAYS} วัน`);
      if (!(d.quota >= 1 && d.quota <= SURVEY_RULES.MAX_QUOTA)) e.push(`จำนวนผู้ตอบ 1–${SURVEY_RULES.MAX_QUOTA} คน`);
      if (draw) {
        if (!d.prizes.length) e.push('ใส่รางวัลอย่างน้อย 1 อันดับ');
        if (d.prizes.length > d.quota) e.push('จำนวนรางวัลต้องไม่เกินจำนวนผู้ตอบ');
        if (d.prizes.some((p) => !(p >= 1))) e.push('รางวัลแต่ละอันดับต้องอย่างน้อย 1 Coin');
      } else if (!(d.reward >= 1)) e.push('ใส่รางวัลต่อคน');
    }
    if (s === 1) {
      if (!prefill) e.push(`วางลิงก์กรอกล่วงหน้าของ Google Form ที่ใส่คำว่า ${PREFILL_PLACEHOLDER} ไว้ในช่องรหัส`);
      if (!(d.questionCount >= 1 && d.questionCount <= SURVEY_RULES.MAX_QUESTIONS)) e.push(`จำนวนข้อ 1–${SURVEY_RULES.MAX_QUESTIONS}`);
      if (band && !draw && d.reward < band.minReward) e.push(`แบบสอบถาม ${d.questionCount} ข้อ ต้องให้รางวัลอย่างน้อย ${band.minReward} Coin/คน (แก้ในขั้นข้อมูล)`);
      if (band && draw && d.prizes.some((p) => p < band.minReward)) e.push(`แบบสอบถาม ${d.questionCount} ข้อ แต่ละรางวัลต้องอย่างน้อย ${band.minReward} Coin (แก้ในขั้นข้อมูล)`);
    }
    if (s === 2) {
      if (d.limitFaculty && !d.faculties.length) e.push('เลือกคณะอย่างน้อย 1 คณะ หรือปิดการจำกัดคณะ');
      if (d.limitYear && !d.years.length) e.push('เลือกชั้นปีอย่างน้อย 1 ชั้นปี หรือปิดการจำกัดชั้นปี');
    }
    return e;
  }
  const stepDone = check(step).length === 0;

  function next() {
    const e = check(step);
    if (e.length) { setErrors(e); return; }
    setErrors([]); setStep((s) => Math.min(3, s + 1)); window.scrollTo({ top: 0 });
  }
  function back() {
    if (step === 0) { router.push('/surveys'); return; }
    setErrors([]); setStep((s) => s - 1); window.scrollTo({ top: 0 });
  }
  function saveDraft() {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); setNotice('บันทึกฉบับร่างในเครื่องนี้แล้ว'); }
    catch { setNotice('บันทึกฉบับร่างไม่ได้ในเบราว์เซอร์นี้'); }
  }

  const own = q ? ownContribution(d, q, me.balance) : 0;
  const cost = q ? q.postFee + own : 0;
  async function publish() {
    const all = [0, 1, 2].flatMap(check);
    if (all.length) { setErrors(all); return; }
    if (!q) return;
    setBusy(true); setErrors([]);
    try {
      const s = await post<SurveyDetail>('/surveys', {
        title: d.title.trim(), description: d.description.trim(), mode: 'EXTERNAL', externalVerify: 'SCRIPT',
        externalUrl: d.formUrl.trim(), externalQuestionCount: d.questionCount, questions: [],
        category: d.category, estMinutes: d.estMinutes, tags: d.tags,
        closesAt: closesAtOf(d).toISOString(), quota: d.quota,
        rewardMode: d.rewardMode, rewardPerResponse: draw ? Math.max(...d.prizes) : d.reward, prizes: draw ? d.prizes : [],
        eligibleFaculties: d.limitFaculty ? d.faculties : [], eligibleYears: d.limitYear ? d.years : [],
        ownerContribution: own, requestSubsidy: d.requestSubsidy,
      });
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ไม่เป็นไร */ }
      setCreated(s);
    } catch (e) { setErrors([(e as Error).message]); } finally { setBusy(false); }
  }

  if (!info) return <Spinner />;

  return (
    <div className="space-y-[9px]">
      {/* Title row */}
      <div className="flex items-center justify-between gap-3">
        <div className="leading-tight">
          <p className="text-[11px] font-bold tracking-wide text-primary">แบบสอบถาม</p>
          <h1 className="text-[26px] font-extrabold tracking-tight">สร้างแบบสอบถาม</h1>
        </div>
        <button type="button" onClick={saveDraft} className="shrink-0 rounded-full border border-[#ddd4f7] bg-indigo px-3 py-2 text-[13px] font-bold text-white hover:bg-indigo/90">บันทึกร่าง</button>
      </div>

      {/* Create progress */}
      <div className="space-y-[7px]">
        <ol className="flex justify-between text-[13px]">
          {STEPS.map((l, i) => (
            <li key={l}>
              <button type="button" disabled={i > step} onClick={() => { setErrors([]); setStep(i); }}
                className={cx(i === step ? 'font-extrabold text-primary' : i < step ? 'font-semibold text-indigo hover:underline' : 'font-semibold text-muted-foreground')}>{l}</button>
            </li>
          ))}
        </ol>
        <div className="flex h-1.5 gap-[5px]" aria-hidden>
          {STEPS.map((l, i) => <span key={l} className={cx('flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-[#e3d8ff]')} />)}
        </div>
        <p className="text-[13px] text-muted-foreground">ขั้นที่ {step + 1} จาก 4 · {STEPS[step]}</p>
      </div>

      {notice && <p role="status" className="flex items-center justify-between rounded-xl bg-success-soft px-3 py-2 text-xs font-semibold text-success">{notice}<button type="button" aria-label="ปิด" onClick={() => setNotice('')}><X className="size-4" /></button></p>}

      {step === 0 && <InfoStep d={d} set={set} band={band} done={stepDone} />}
      {step === 1 && <LinkStep d={d} set={set} valid={!!prefill} />}
      {step === 2 && <EligibilityStep d={d} set={set} />}
      {step === 3 && q && <PreviewStep d={d} set={set} q={q} isFirstPost={info.isFirstPost} subsidy={info.subsidy} balance={me.balance} />}

      {errors.length > 0 && (
        <div role="alert" className="space-y-0.5 rounded-xl bg-destructive-soft px-3 py-2.5">
          {errors.map((e) => <ErrorText key={e}>{e}</ErrorText>)}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2.5 pt-1">
        <button type="button" onClick={back} className="flex h-[50px] flex-1 items-center justify-center rounded-[14px] border border-[#ddd4f7] bg-card text-[15px] font-bold text-indigo hover:bg-lavender-soft">
          {step === 0 ? 'ยกเลิก' : 'ย้อนกลับ'}
        </button>
        {step < 3 ? (
          <button type="button" onClick={next} className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-primary bg-primary text-[15px] font-bold text-white hover:bg-primary/90">
            <ArrowRight className="size-[17px]" />{step === 2 ? 'ตรวจทาน' : 'ถัดไป'}
          </button>
        ) : (
          <button type="button" onClick={publish} disabled={busy || me.balance < cost}
            className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-primary bg-primary text-[15px] font-bold text-white hover:bg-primary/90 disabled:opacity-50">
            <Send className="size-[17px]" />{busy ? 'กำลังโพสต์…' : 'โพสต์แบบสอบถาม'}
          </button>
        )}
      </div>

      {created && (
        <Modal label="โพสต์แล้ว">
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success"><CheckCircle2 className="size-7" /></span>
          <p className="mt-4 text-xl font-extrabold">โพสต์แบบสอบถามแล้ว</p>
          <p className="mt-2 text-sm text-muted-foreground">เหลืออีกขั้นเดียว: วางสคริปต์ใน Google Form เพื่อให้ TEMBO รู้เมื่อมีคนส่ง แบบสอบถามจะขึ้นฟีดหลังเชื่อมเสร็จ</p>
          <Button type="button" className="mt-5 w-full" onClick={() => router.replace(`/surveys/${created.id}`)}><Link2 />ไปเชื่อม Google Form</Button>
        </Modal>
      )}
    </div>
  );
}

type SetFn = <K extends keyof Draft>(k: K, v: Draft[K]) => void;
type Quote = NonNullable<ReturnType<typeof quoteSurvey>>;

/** Coin ที่ผู้โพสต์ลงเอง: สุ่มจับรางวัลต้องลงครบ / รางวัลเท่ากันลงตั้งแต่พอจ่าย 1 คนถึงเต็มยอด (ค่าเริ่มต้น = เต็มเท่าที่มี) */
function ownContribution(d: Draft, q: Quote, balance: number) {
  if (d.rewardMode === 'DRAW') return q.maxOwnerContribution;
  const want = d.contribution ?? Math.max(q.minOwnerContribution, Math.min(q.maxOwnerContribution, balance - q.postFee));
  return Math.min(q.maxOwnerContribution, Math.max(q.minOwnerContribution, want));
}

const Panel = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <section className={cx('space-y-2 rounded-2xl bg-card p-3.5 shadow-[0_8px_24px_rgba(43,23,96,0.07)]', className)}>{children}</section>
);
const fieldBox = 'flex h-12 w-full items-center gap-2 rounded-[14px] border-[1.2px] border-[#ddd4f7] bg-card px-[13px] text-[13px] text-indigo focus-within:border-primary';
const bare = 'min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground';

function F({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex min-w-0 flex-1 flex-col gap-[5px]', className)}>
      <span className="text-xs font-bold text-indigo">{label}</span>
      {children}
    </label>
  );
}

function SelectBox({ icon, value, onChange, children, label }: { icon: ReactNode; value: string | number; onChange: (v: string) => void; children: ReactNode; label: string }) {
  return (
    <div className={cx(fieldBox, 'relative')}>
      <span className="text-primary [&_svg]:size-[17px]">{icon}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cx(bare, 'cursor-pointer appearance-none pr-6')}>{children}</select>
      <ChevronDown className="pointer-events-none absolute right-3 size-4 text-indigo" />
    </div>
  );
}

function NumberBox({ icon, value, onChange, suffix, label, min = 1, max }: { icon: ReactNode; value: number; onChange: (n: number) => void; suffix?: string; label: string; min?: number; max?: number }) {
  return (
    <div className={fieldBox}>
      <span className="text-muted-foreground [&_svg]:size-[17px]">{icon}</span>
      <input aria-label={label} type="number" inputMode="numeric" min={min} max={max} value={Number.isFinite(value) ? value : ''} onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} className={bare} />
      {suffix && <span className="text-muted-foreground">{suffix}</span>}
    </div>
  );
}

// ───────── ขั้นที่ 1: ข้อมูล (Figma: SURVEY / Create Information) ─────────

function InfoStep({ d, set, band, done }: { d: Draft; set: SetFn; band: ReturnType<typeof surveyBand>; done: boolean }) {
  const [tagsOpen, setTagsOpen] = useState(false);
  const draw = d.rewardMode === 'DRAW';
  const total = d.prizes.reduce((a, b) => a + (b || 0), 0);
  return (
    <Panel>
      <F label="ชื่อแบบสอบถาม *">
        <input className={fieldBox} maxLength={150} value={d.title} onChange={(e) => set('title', e.target.value)} placeholder="เช่น ประสบการณ์การเรียนในมหาวิทยาลัย 2569" />
      </F>
      <F label="รายละเอียด *">
        <textarea className={cx(fieldBox, 'h-[66px] resize-none py-[11px] leading-[1.35] outline-none')} maxLength={2000} value={d.description} onChange={(e) => set('description', e.target.value)} placeholder="ช่วยให้เราเข้าใจว่า… ใครควรตอบ ข้อมูลจะใช้อย่างไร" />
      </F>
      <div className="flex gap-2">
        <F label="หมวดหมู่">
          <SelectBox label="หมวดหมู่" icon={<Shapes />} value={d.category} onChange={(v) => set('category', v as SurveyCategory)}>
            <option value="" disabled>เลือก</option>
            {Object.entries(SURVEY_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </SelectBox>
        </F>
        <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
          <span className="text-xs font-bold text-indigo">แท็ก</span>
          <button type="button" aria-expanded={tagsOpen} onClick={() => setTagsOpen(!tagsOpen)} className={cx(fieldBox, 'text-left')}>
            <Tag className="size-[17px] shrink-0 text-muted-foreground" />
            <span className={cx('min-w-0 flex-1 truncate', !d.tags.length && 'text-muted-foreground')}>{d.tags.length ? d.tags.join(', ') : 'เลือกหัวข้อ'}</span>
          </button>
        </div>
      </div>
      {tagsOpen && (
        <div className="rounded-[14px] bg-lavender-soft p-2.5">
          <p className="mb-1.5 text-[11px] text-muted-foreground">เลือกได้ไม่เกิน 5 · ใช้จับคู่กับความสนใจของผู้ตอบในฟีด</p>
          <div className="flex flex-wrap gap-1.5">
            {INTERESTS.map((t) => (
              <button key={t} type="button" aria-pressed={d.tags.includes(t)}
                onClick={() => set('tags', d.tags.includes(t) ? d.tags.filter((x) => x !== t) : d.tags.length >= 5 ? d.tags : [...d.tags, t])}
                className={cx('rounded-full px-3 py-1.5 text-xs font-bold', d.tags.includes(t) ? 'bg-primary text-white' : 'bg-card text-primary')}>{t}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <F label="เวลาทำโดยประมาณ">
          <SelectBox label="เวลาทำโดยประมาณ" icon={<Clock3 />} value={d.estMinutes} onChange={(v) => set('estMinutes', Number(v))}>
            <option value={0} disabled>เลือก</option>
            {EST_MINUTES.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </SelectBox>
        </F>
        <F label="ปิดรับ">
          <div className={fieldBox}>
            <Calendar className="size-[17px] shrink-0 text-muted-foreground" />
            <input type="date" aria-label="วันปิดรับ" value={d.closesOn} min={dateInput(new Date())} onChange={(e) => set('closesOn', e.target.value)} className={bare} />
          </div>
        </F>
      </div>

      {/* รูปแบบรางวัล: เท่ากัน / สุ่มจับรางวัล */}
      <div className="flex flex-col gap-[5px]">
        <span className="text-xs font-bold text-indigo">รูปแบบรางวัล</span>
        <div role="radiogroup" aria-label="รูปแบบรางวัล" className="grid grid-cols-2 gap-1 rounded-[14px] bg-lavender-soft p-1">
          {(['EQUAL', 'DRAW'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={d.rewardMode === m} onClick={() => set('rewardMode', m)}
              className={cx('flex h-10 items-center justify-center gap-1.5 rounded-[11px] text-[13px] font-bold', d.rewardMode === m ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}>
              {m === 'EQUAL' ? <Coins className="size-4" /> : <Gift className="size-4" />}{REWARD_MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <F label="จำนวนผู้ตอบ">
          <NumberBox label="จำนวนผู้ตอบ" icon={<Users />} value={d.quota} max={SURVEY_RULES.MAX_QUOTA} onChange={(n) => set('quota', n)} suffix="คน" />
        </F>
        {draw ? (
          <F label="รางวัลรวม">
            <div className={cx(fieldBox, 'bg-lavender-soft/60')}><Coins className="size-[17px] text-muted-foreground" /><span className="flex-1">{total.toLocaleString()} Coin</span></div>
          </F>
        ) : (
          <F label="รางวัล / คน">
            <NumberBox label="รางวัลต่อคน" icon={<Coins />} value={d.reward} max={SURVEY_RULES.MAX_REWARD} onChange={(n) => set('reward', n)} suffix="Coin" />
          </F>
        )}
      </div>
      {draw ? (
        <div className="space-y-1.5 rounded-[14px] bg-lavender-soft p-2.5">
          <p className="text-[11px] text-muted-foreground">ระบบสุ่มผู้ได้รางวัลจากทุกคนที่ส่งแบบสอบถามตอนปิดรับ — ทุกคนมีโอกาสเท่ากัน</p>
          {d.prizes.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-xs font-bold text-indigo">อันดับ {i + 1}</span>
              <div className={cx(fieldBox, 'h-10')}>
                <input aria-label={`รางวัลอันดับ ${i + 1}`} type="number" min={1} max={DRAW_RULES.MAX_PRIZE} value={Number.isFinite(p) ? p : ''}
                  onChange={(e) => set('prizes', d.prizes.map((x, j) => j === i ? (e.target.value === '' ? NaN : Number(e.target.value)) : x))} className={bare} />
                <span className="text-muted-foreground">Coin</span>
              </div>
              <button type="button" aria-label={`ลบอันดับ ${i + 1}`} disabled={d.prizes.length <= 1} onClick={() => set('prizes', d.prizes.filter((_, j) => j !== i))}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-card disabled:opacity-30"><Minus className="size-4" /></button>
            </div>
          ))}
          {d.prizes.length < DRAW_RULES.MAX_PRIZES && (
            <button type="button" onClick={() => set('prizes', [...d.prizes, d.prizes.at(-1) || 10])} className="flex items-center gap-1 text-xs font-bold text-primary"><Plus className="size-4" />เพิ่มรางวัล</button>
          )}
        </div>
      ) : band && <p className="text-[11px] text-muted-foreground">แนะนำ {band.suggestedReward} Coin/คน สำหรับ {d.questionCount} ข้อ (ขั้นต่ำ {band.minReward} — ตั้งจำนวนข้อในขั้นถัดไป)</p>}
      {done && <p className="text-[11px] font-semibold text-success">✓ กรอกข้อมูลที่จำเป็นครบแล้ว</p>}
    </Panel>
  );
}

// ───────── ขั้นที่ 2: ลิงก์ (Figma: SURVEY / Create — External Link) ─────────

function LinkStep({ d, set, valid }: { d: Draft; set: SetFn; valid: boolean }) {
  return (
    <>
      <Panel className="space-y-3">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lavender text-primary"><Link2 className="size-5" /></span>
          <div>
            <h2 className="text-[15px] font-extrabold">ลิงก์ Google Form</h2>
            <p className="text-xs text-muted-foreground">TEMBO ใส่รหัสเฉพาะของผู้ตอบแต่ละคนลงในฟอร์มให้ แล้วรู้ได้เองเมื่อมีคนกดส่ง</p>
          </div>
        </div>
        <F label="ลิงก์กรอกล่วงหน้า *">
          <div className={cx(fieldBox, d.formUrl && !valid && 'border-destructive')}>
            <Globe2 className="size-[17px] shrink-0 text-muted-foreground" />
            <input type="url" value={d.formUrl} onChange={(e) => set('formUrl', e.target.value)} placeholder="https://docs.google.com/forms/d/e/…/viewform?usp=pp_url&entry…" className={bare} />
            {valid && <CheckCircle2 className="size-[17px] shrink-0 text-success" />}
          </div>
        </F>
        <p className="-mt-1 text-[11px] text-muted-foreground">{valid ? 'ลิงก์ถูกต้อง พบช่องรหัส TEMBO แล้ว' : d.formUrl ? `ไม่พบคำว่า ${PREFILL_PLACEHOLDER} ในลิงก์ ทำตามขั้นตอนด้านล่าง` : 'ต้องเป็นลิงก์จาก “รับลิงก์ที่กรอกไว้ล่วงหน้า”'}</p>
        <F label="จำนวนข้อในฟอร์ม *">
          <NumberBox label="จำนวนข้อในฟอร์ม" icon={<Shapes />} value={d.questionCount} max={SURVEY_RULES.MAX_QUESTIONS} onChange={(n) => set('questionCount', n)} suffix="ข้อ" />
        </F>
        <div className="rounded-[14px] bg-coin-soft p-3 text-indigo">
          <p className="text-xs font-extrabold">วิธีเตรียม Google Form</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs leading-relaxed">
            <li>เพิ่มคำถาม <b>“คำตอบสั้น”</b> ชื่อ <b>รหัส TEMBO (ห้ามแก้)</b> และเปิด <b>จำเป็น</b></li>
            <li>เมนู <b>⋮</b> → <b>รับลิงก์ที่กรอกไว้ล่วงหน้า</b></li>
            <li>พิมพ์ <b className="font-mono">{PREFILL_PLACEHOLDER}</b> ในช่องรหัส TEMBO → <b>รับลิงก์</b> → <b>คัดลอกลิงก์</b> มาวางด้านบน</li>
            <li>ตั้งค่าให้ <b>ทุกคนที่มีลิงก์</b> ตอบได้ (ไม่ต้องล็อกอิน มช.)</li>
          </ol>
        </div>
      </Panel>
      <p className="flex items-start gap-2 rounded-2xl bg-lavender-soft p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-[18px] shrink-0 text-primary" />TEMBO ไม่เก็บคำตอบของฟอร์ม คำตอบอยู่ใน Google Form ของคุณ — TEMBO รู้เพียงว่าใครส่งแล้ว
      </p>
    </>
  );
}

// ───────── ขั้นที่ 3: ผู้ตอบ (Figma: SURVEY / Create — Eligibility) ─────────

function EligibilityStep({ d, set }: { d: Draft; set: SetFn }) {
  const count = 1 + Number(d.limitFaculty) + Number(d.limitYear) + Number(d.tags.length > 0);
  return (
    <>
      <Panel className="space-y-1">
        <div className="flex items-start justify-between gap-2 pb-1">
          <div>
            <h2 className="text-[15px] font-extrabold">ใครตอบได้บ้าง</h2>
            <p className="text-[11px] text-muted-foreground">ไม่จำกัด = เปิดให้ทุกคนที่ยืนยัน มช. แล้ว</p>
          </div>
          <span className="shrink-0 rounded-full bg-lavender px-2.5 py-1 text-[11px] font-bold text-primary">{count} เงื่อนไข</span>
        </div>
        <Requirement checked locked label="ยืนยันอีเมล @cmu.ac.th แล้ว" description="บังคับทุกแบบสอบถาม กันบัญชีปลอมมารับ Coin" />
        <Requirement checked={d.limitFaculty} onToggle={() => set('limitFaculty', !d.limitFaculty)} label="จำกัดคณะ"
          description={d.limitFaculty && d.faculties.length ? d.faculties.join(', ') : 'เลือกเฉพาะคณะที่ต้องการ'} />
        {d.limitFaculty && (
          <div className="flex flex-wrap gap-1.5 pb-2 pl-[34px]">
            {FACULTIES.map((f) => (
              <button key={f} type="button" aria-pressed={d.faculties.includes(f)} onClick={() => set('faculties', d.faculties.includes(f) ? d.faculties.filter((x) => x !== f) : [...d.faculties, f])}
                className={cx('rounded-full px-2.5 py-1 text-[11px] font-bold', d.faculties.includes(f) ? 'bg-primary text-white' : 'bg-lavender-soft text-primary')}>{f}</button>
            ))}
          </div>
        )}
        <Requirement checked={d.limitYear} onToggle={() => set('limitYear', !d.limitYear)} label="จำกัดชั้นปี"
          description={d.limitYear && d.years.length ? `ปี ${[...d.years].sort().join(', ')}` : 'เลือกเฉพาะชั้นปีที่ต้องการ'} />
        {d.limitYear && (
          <div className="flex flex-wrap gap-1.5 pb-2 pl-[34px]">
            {STUDY_YEARS.map((y) => (
              <button key={y} type="button" aria-pressed={d.years.includes(y)} onClick={() => set('years', d.years.includes(y) ? d.years.filter((x) => x !== y) : [...d.years, y])}
                className={cx('min-w-12 rounded-full px-3 py-1 text-xs font-bold', d.years.includes(y) ? 'bg-primary text-white' : 'bg-lavender-soft text-primary')}>ปี {y}{y === 6 ? '+' : ''}</button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-[5px] pt-2">
          <span className="text-xs font-bold text-indigo">ความสนใจที่ตรงกัน</span>
          <div className="min-h-[72px] rounded-[14px] border-[1.2px] border-[#ddd4f7] px-[13px] py-[11px] text-[13px] leading-[1.35]">
            {d.tags.length ? d.tags.join(', ') : <span className="text-muted-foreground">ยังไม่ได้เลือกแท็ก (เลือกได้ในขั้นข้อมูล)</span>}
          </div>
          <p className="text-[11px] text-muted-foreground">ไม่ได้จำกัดว่าใครตอบได้ แต่ดันขึ้น “ฟีดของคุณ” ของคนที่สนใจหัวข้อนี้</p>
        </div>
      </Panel>
      <p className="flex items-start gap-2 rounded-2xl bg-lavender-soft p-3 text-xs text-muted-foreground">
        <UserCheck className="mt-0.5 size-[18px] shrink-0 text-primary" />คนที่ไม่อยู่ในกลุ่มจะไม่เห็นแบบสอบถามนี้ในฟีด และกดเริ่มทำไม่ได้
      </p>
    </>
  );
}

function Requirement({ checked, locked, onToggle, label, description }: { checked: boolean; locked?: boolean; onToggle?: () => void; label: string; description: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-disabled={locked} onClick={locked ? undefined : onToggle}
      className={cx('flex w-full items-center gap-3 rounded-xl py-2.5 text-left', !locked && 'hover:bg-lavender-soft/60')}>
      <span className={cx('flex size-[22px] shrink-0 items-center justify-center rounded-md border-[1.5px]', checked ? 'border-primary bg-primary text-white' : 'border-[#ddd4f7] bg-card')}>
        {checked && <Check className="size-[13px]" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-bold text-indigo">{label}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{description}</span>
      </span>
    </button>
  );
}

// ───────── ขั้นที่ 4: ตรวจทาน (Figma: SURVEY / Create — Preview) ─────────

function PreviewStep({ d, set, q, isFirstPost, subsidy, balance }: {
  d: Draft; set: SetFn; q: Quote; isFirstPost: boolean;
  subsidy: SurveyQuoteResponse['subsidy']; balance: number;
}) {
  const draw = d.rewardMode === 'DRAW';
  const own = ownContribution(d, q, balance);
  const cost = q.postFee + own;
  const friends = q.maxOwnerContribution - own;
  const who = [d.limitFaculty && d.faculties.length ? `คณะ${d.faculties.join(', ')}` : null, d.limitYear && d.years.length ? `ปี ${[...d.years].sort().join(', ')}` : null].filter(Boolean);
  return (
    <>
      <Panel className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-lavender px-2.5 py-1 text-[11px] font-bold text-primary">{d.category ? SURVEY_CATEGORIES[d.category] : '—'}</span>
          <span className="flex items-center gap-1.5 rounded-full bg-coin-soft px-2.5 py-1.5 text-[13px] font-extrabold"><span className="size-[17px] rounded-full bg-coin" />{draw ? `ลุ้น ${Math.max(...d.prizes)}` : `+${d.reward}`} Coin</span>
        </div>
        <div>
          <h2 className="text-lg leading-snug font-extrabold">{d.title}</h2>
          <p className="mt-1 line-clamp-3 text-[13px] text-muted-foreground">{d.description}</p>
        </div>
        {d.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{d.tags.map((t) => <span key={t} className="rounded-full bg-lavender-soft px-2 py-1 text-[11px] font-bold text-primary">{t}</span>)}</div>}
        <hr className="border-border" />
        <Detail icon={<Clock3 />} label="เวลาทำโดยประมาณ" value={estMinutesLabel(d.estMinutes) ?? '—'} />
        <Detail icon={<Calendar />} label="ปิดรับ" value={thaiDate(d.closesOn)} />
        <Detail icon={<Users />} label="จำนวนผู้ตอบ" value={`${d.quota} คน`} />
        <Detail icon={<Coins />} label={draw ? `สุ่มจับรางวัล ${d.prizes.length} รางวัล` : 'รางวัลต่อคน'} value={draw ? d.prizes.join(' / ') : `${d.reward} Coin`} />
        <hr className="border-border" />
        <p className="flex items-center gap-2 text-xs"><Link2 className="size-[17px] shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-muted-foreground">{d.formUrl}</span><CheckCircle2 className="size-[17px] shrink-0 text-success" /></p>
        <p className="flex items-center gap-2 text-xs"><UserCheck className="size-[17px] shrink-0 text-primary" /><span className="text-muted-foreground">ยืนยัน มช. แล้ว{who.length ? ` · ${who.join(' · ')}` : ' · ทุกคณะ ทุกชั้นปี'}</span></p>
      </Panel>

      <Panel className="space-y-2.5">
        <h3 className="text-[15px] font-extrabold">Coin ที่ใช้</h3>
        <label className={cx('flex gap-3 rounded-xl border p-3', subsidy.eligible ? 'border-primary/30 bg-lavender-soft/50' : 'border-border opacity-60')}>
          <input type="checkbox" className="mt-0.5 accent-primary" disabled={!subsidy.eligible} checked={d.requestSubsidy} onChange={(e) => set('requestSubsidy', e.target.checked)} />
          <span className="text-xs">
            <b>ขอระบบสมทบช่วงเปิดตัว</b> — TEMBO ช่วยครึ่งหนึ่ง สูงสุด {SURVEY_RULES.SUBSIDY_MAX_AMOUNT} Coin
            <span className="mt-0.5 block text-muted-foreground">{subsidy.reason ?? 'แอดมินตรวจก่อนว่าเป็นงานวิจัยจริง ระหว่างนั้นยังไม่รับคำตอบ'}</span>
          </span>
        </label>
        <dl className="space-y-1.5 text-[13px]">
          <Row k={draw ? 'รางวัลรวม (ลงครบตั้งแต่แรก)' : `รางวัลรวม (${d.reward} × ${d.quota} คน)`} v={q.targetPool} />
          {q.subsidyAmount > 0 && <Row k="ระบบสมทบ (เมื่ออนุมัติ)" v={-q.subsidyAmount} />}
          <Row k={isFirstPost ? 'ค่าโพสต์ (โพสต์แรกฟรี)' : 'ค่าโพสต์'} v={q.postFee} />
          {!draw && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <dt>คุณลง Coin เอง<span className="block text-[11px] text-muted-foreground">{q.minOwnerContribution}–{q.maxOwnerContribution} · ที่ขาดให้เพื่อนช่วยสนับสนุนได้</span></dt>
              <dd><input type="number" aria-label="Coin ที่ลงเอง" min={q.minOwnerContribution} max={q.maxOwnerContribution} value={own}
                onChange={(e) => set('contribution', Number(e.target.value))} className="h-10 w-24 rounded-xl border border-[#ddd4f7] px-2 text-right font-bold outline-none focus:border-primary" /></dd>
            </div>
          )}
          {friends > 0 && <Row k="รอเพื่อนสนับสนุน" v={friends} />}
          <div className="border-t border-border pt-1.5"><Row k="หักจากกระเป๋าตอนโพสต์" v={cost} bold /></div>
          <Row k="คงเหลือหลังโพสต์" v={balance - cost} />
        </dl>
        {balance < cost && <ErrorText>Coin ไม่พอ (มี {balance.toLocaleString()})</ErrorText>}
        <p className="text-[11px] text-muted-foreground">Coin ที่เหลือตอนปิดรับคืนให้คุณ · ค่าโพสต์ไม่คืน</p>
      </Panel>
    </>
  );
}

function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-lavender-soft text-primary [&_svg]:size-4">{icon}</span>
      <span className="flex-1 text-xs text-muted-foreground">{label}</span>
      <span className="text-[13px] font-bold text-indigo">{value}</span>
    </div>
  );
}

function Row({ k, v, bold }: { k: string; v: number; bold?: boolean }) {
  return <div className={cx('flex justify-between', bold && 'font-extrabold')}><dt>{k}</dt><dd>{v.toLocaleString()}</dd></div>;
}

