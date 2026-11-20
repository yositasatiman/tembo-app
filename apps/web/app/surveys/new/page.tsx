'use client';
import { ReactNode, Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight, Calendar, Check, CheckCircle2, Clock3, Coins, FilePen, Gift, Globe2, Link2, Minus, Plus, Send, Shapes,
  ShieldCheck, Tag, UserCheck, Users,
} from 'lucide-react';
import {
  DRAW_RULES, EST_MINUTES, estMinutesLabel, FACULTIES, facultyLabel, fmtDMY, INTERESTS, interestLabel, isGoogleFormUrl, quoteSurvey,
  REWARD_MODE_LABEL, STUDY_YEARS, SURVEY_CATEGORIES, SURVEY_RULES, surveyBand,
  type DraftDetail, type DraftSummary, type RewardMode, type SurveyCategory, type SurveyDetail, type SurveyQuoteResponse,
} from '@tembo/shared';
import { api, post } from '@/lib/api';
import { useT, type TFn } from '@/lib/i18n';
import { AppShell, useMe } from '@/components/shell';
import { bareInput, DateField, ErrorSummary, FieldError, fieldBox, Req, Select } from '@/components/form';
import { Button, cx, ErrorText, fmtDate, Modal, Progress, Spinner } from '@/components/ui';

export default function NewSurveyPage() {
  return <AppShell><Suspense fallback={<Spinner />}><CreateSurvey /></Suspense></AppShell>;
}

const STEPS = [{ en: 'Info', th: 'ข้อมูล' }, { en: 'Link', th: 'ลิงก์' }, { en: 'Eligibility', th: 'ผู้ตอบ' }, { en: 'Preview', th: 'ตรวจทาน' }] as const;

interface Draft {
  title: string; description: string; category: SurveyCategory | ''; tags: string[]; estMinutes: number; closesOn: string;
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
const num = (n: number) => Number.isFinite(n);

type FieldKey = 'title' | 'description' | 'category' | 'estMinutes' | 'closesOn' | 'quota' | 'reward' | 'prizes'
  | 'formUrl' | 'questionCount' | 'faculties' | 'years';
type Issue = { field: FieldKey; message: string; missing?: string };

/** ตรวจแต่ละขั้น — missing = ชื่อช่องที่ยังไม่กรอก (ใช้รวมเป็นข้อความเดียวในสรุปด้านล่าง) */
function issuesOf(step: number, d: Draft, t: TFn): Issue[] {
  const out: Issue[] = [];
  const need = (field: FieldKey, ok: boolean, name: string, message: string) => { if (!ok) out.push({ field, message, missing: name }); };
  const band = surveyBand(d.questionCount);
  const draw = d.rewardMode === 'DRAW';
  if (step === 0) {
    need('title', d.title.trim().length > 0, t('Survey title', 'ชื่อแบบสอบถาม'), t('Title is required.', 'กรุณากรอกชื่อแบบสอบถาม'));
    if (d.title.trim().length > 0 && d.title.trim().length < 3) out.push({ field: 'title', message: t('Use at least 3 characters.', 'ชื่อต้องมีอย่างน้อย 3 ตัวอักษร') });
    need('description', d.description.trim().length > 0, t('Description', 'รายละเอียด'), t('Add a short description.', 'กรุณากรอกรายละเอียด'));
    need('category', !!d.category, t('Category', 'หมวดหมู่'), t('Select a category.', 'กรุณาเลือกหมวดหมู่'));
    need('estMinutes', d.estMinutes > 0, t('Est. completion', 'เวลาทำโดยประมาณ'), t('Select the completion time.', 'กรุณาเลือกเวลาทำโดยประมาณ'));
    if (!d.closesOn) out.push({ field: 'closesOn', message: t('Enter a valid date (dd/mm/yyyy).', 'กรอกวันที่ให้ถูกต้อง (dd/mm/yyyy)'), missing: t('Expiration', 'วันปิดรับ') });
    else {
      const c = closesAtOf(d).getTime();
      if (!(c > Date.now() + 3_600_000)) out.push({ field: 'closesOn', message: t('Choose today or a later date.', 'วันปิดรับต้องเป็นวันนี้หรือหลังจากนี้') });
      else if (c > Date.now() + SURVEY_RULES.MAX_DURATION_DAYS * 86_400_000) out.push({ field: 'closesOn', message: t(`Up to ${SURVEY_RULES.MAX_DURATION_DAYS} days from today.`, `เปิดรับได้ไม่เกิน ${SURVEY_RULES.MAX_DURATION_DAYS} วัน`) });
    }
    if (!num(d.quota)) need('quota', false, t('Participant count', 'จำนวนผู้ตอบ'), t('Enter the number of participants.', 'กรุณากรอกจำนวนผู้ตอบ'));
    else if (d.quota < 1 || d.quota > SURVEY_RULES.MAX_QUOTA) out.push({ field: 'quota', message: t(`Between 1 and ${SURVEY_RULES.MAX_QUOTA}.`, `ระหว่าง 1–${SURVEY_RULES.MAX_QUOTA} คน`) });
    if (draw) {
      if (d.prizes.some((p) => !num(p) || p < 1)) out.push({ field: 'prizes', message: t('Each prize needs at least 1 Coin.', 'รางวัลแต่ละอันดับต้องอย่างน้อย 1 Coin'), missing: t('Prizes', 'รางวัล') });
      else if (num(d.quota) && d.prizes.length > d.quota) out.push({ field: 'prizes', message: t('There cannot be more prizes than participants.', 'จำนวนรางวัลต้องไม่เกินจำนวนผู้ตอบ') });
    } else if (!num(d.reward)) need('reward', false, t('Reward / participant', 'รางวัล / คน'), t('Enter the reward per participant.', 'กรุณากรอกรางวัลต่อคน'));
    else if (d.reward < 1) out.push({ field: 'reward', message: t('At least 1 Coin.', 'อย่างน้อย 1 Coin') });
  }
  if (step === 1) {
    if (!d.formUrl.trim()) need('formUrl', false, t('Google Form link', 'ลิงก์ Google Form'), t('Please enter your survey link.', 'กรุณากรอกลิงก์แบบสอบถามของคุณ'));
    else if (!isGoogleFormUrl(d.formUrl)) out.push({ field: 'formUrl', message: t('Please enter a Google Form link (forms.gle or docs.google.com/forms).', 'กรุณากรอกลิงก์ Google Form (forms.gle หรือ docs.google.com/forms)') });
    if (!num(d.questionCount)) need('questionCount', false, t('Number of questions', 'จำนวนข้อ'), t('Enter how many questions the form has.', 'กรุณากรอกจำนวนข้อในฟอร์ม'));
    else if (d.questionCount < 1 || d.questionCount > SURVEY_RULES.MAX_QUESTIONS) out.push({ field: 'questionCount', message: t(`Between 1 and ${SURVEY_RULES.MAX_QUESTIONS}.`, `ระหว่าง 1–${SURVEY_RULES.MAX_QUESTIONS} ข้อ`) });
    else if (band && !draw && num(d.reward) && d.reward < band.minReward) out.push({ field: 'questionCount', message: t(`A ${d.questionCount}-question survey needs at least ${band.minReward} Coin per person. Change the reward in Info.`, `แบบสอบถาม ${d.questionCount} ข้อ ต้องให้รางวัลอย่างน้อย ${band.minReward} Coin/คน แก้ได้ในขั้นข้อมูล`) });
    else if (band && draw && d.prizes.some((p) => p < band.minReward)) out.push({ field: 'questionCount', message: t(`A ${d.questionCount}-question survey needs each prize to be at least ${band.minReward} Coin. Change the prizes in Info.`, `แบบสอบถาม ${d.questionCount} ข้อ แต่ละรางวัลต้องอย่างน้อย ${band.minReward} Coin แก้ได้ในขั้นข้อมูล`) });
  }
  if (step === 2) {
    if (d.limitFaculty && !d.faculties.length) out.push({ field: 'faculties', message: t('Choose at least 1 faculty, or turn off this limit.', 'เลือกอย่างน้อย 1 คณะ หรือปิดการจำกัดคณะ') });
    if (d.limitYear && !d.years.length) out.push({ field: 'years', message: t('Choose at least 1 year, or turn off this limit.', 'เลือกอย่างน้อย 1 ชั้นปี หรือปิดการจำกัดชั้นปี') });
  }
  return out;
}

/** ข้อความสรุปรวม 1 ก้อน: "กรุณากรอก: A, B, C" + ปัญหาอื่น */
function summaryOf(issues: Issue[], t: TFn) {
  const missing = issues.filter((i) => i.missing).map((i) => i.missing!);
  const other = issues.filter((i) => !i.missing).map((i) => i.message);
  return [...(missing.length ? [`${t('Please fill in', 'กรุณากรอก')}: ${missing.join(', ')}`] : []), ...other];
}

/** Figma: SURVEY / Create Information → External Link → Eligibility → Preview (+ Draft Saved) */
function CreateSurvey() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useT();
  const { me } = useMe();
  const [info, setInfo] = useState<SurveyQuoteResponse | null>(null);
  const [d, setD] = useState<Draft>(blank);
  const [draftId, setDraftId] = useState<string | null>(params.get('draft'));
  const [loaded, setLoaded] = useState(!params.get('draft'));
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState<Set<number>>(new Set()); // ขั้นที่กดถัดไปแล้ว → เริ่มแสดงข้อผิดพลาด
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<DraftSummary | null>(null);
  const [created, setCreated] = useState<SurveyDetail | null>(null);

  useEffect(() => { api<SurveyQuoteResponse>('/surveys/quote').then(setInfo).catch(() => undefined); }, []);
  useEffect(() => {
    const id = params.get('draft');
    if (!id || draftId !== id || loaded) return;
    api<DraftDetail>(`/survey-drafts/${id}`)
      .then((r) => { setD({ ...blank(), ...(r.data as Partial<Draft>) }); setStep(Math.min(3, r.stepsDone)); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoaded(true));
  }, [params, draftId, loaded]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const band = surveyBand(num(d.questionCount) ? d.questionCount : 0);
  const draw = d.rewardMode === 'DRAW';
  const q = useMemo(() => info && band && num(d.quota) && d.quota >= 1 ? quoteSurvey({
    questionCount: d.questionCount, rewardPerResponse: draw ? Math.max(0, ...d.prizes) : d.reward, quota: d.quota,
    isFirstPost: info.isFirstPost, withSubsidy: d.requestSubsidy, prizes: draw ? d.prizes : undefined,
  }) : null, [info, d, draw, band]);

  const issues = issuesOf(step, d, t);
  const visible = shown.has(step) ? issues : [];
  const errOf = (f: FieldKey) => visible.find((i) => i.field === f)?.message;
  /** ขั้นที่ผ่านติดกันตั้งแต่ขั้นแรก (ใช้แสดง "ทำแล้ว x จาก 4 ขั้น") */
  const firstBad = [0, 1, 2].findIndex((s) => issuesOf(s, d, t).length > 0);
  const doneCount = firstBad === -1 ? 3 : firstBad;

  function next() {
    setShown((s) => new Set(s).add(step));
    if (issues.length) return;
    setStep((s) => Math.min(3, s + 1)); window.scrollTo({ top: 0 });
  }
  function back() {
    if (step === 0) { router.push('/surveys?tab=mine'); return; }
    setStep((s) => s - 1); window.scrollTo({ top: 0 });
  }
  async function saveDraft() {
    setBusy(true); setError('');
    try {
      const body = { title: d.title.trim(), stepsDone: doneCount, data: d };
      const r = draftId
        ? await api<DraftSummary>(`/survey-drafts/${draftId}`, { method: 'PUT', body: JSON.stringify(body) })
        : await post<DraftSummary>('/survey-drafts', body);
      setDraftId(r.id); setSaved(r);
      router.replace(`/surveys/new?draft=${r.id}`, { scroll: false });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  const own = q ? ownContribution(d, q, me.balance) : 0;
  const cost = q ? q.postFee + own : 0;
  async function publish() {
    const first = [0, 1, 2].find((s) => issuesOf(s, d, t).length > 0);
    if (first !== undefined) { setShown(new Set([0, 1, 2])); setStep(first); window.scrollTo({ top: 0 }); return; }
    if (!q) return;
    setBusy(true); setError('');
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
      if (draftId) await api(`/survey-drafts/${draftId}`, { method: 'DELETE' }).catch(() => undefined);
      setCreated(s);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (!info || !loaded) return <Spinner />;
  const summary = summaryOf(visible, t);

  return (
    <div className="space-y-[9px]">
      {/* Title row */}
      <div className="flex items-center justify-between gap-3">
        <div className="leading-tight">
          <p className="text-[11px] font-bold tracking-wide text-primary">{t('SURVEY', 'แบบสอบถาม')}</p>
          <h1 className="text-[26px] font-extrabold tracking-tight">{t('Create Survey', 'สร้างแบบสอบถาม')}</h1>
        </div>
        <button type="button" onClick={saveDraft} disabled={busy}
          className="shrink-0 rounded-full border border-[#ddd4f7] bg-indigo px-3 py-2 text-[13px] font-bold text-white hover:bg-indigo/90 disabled:opacity-60">
          {t('Save Draft', 'บันทึกร่าง')}
        </button>
      </div>

      {/* Create progress */}
      <div className="space-y-[7px]">
        <ol className="flex justify-between text-[13px]">
          {STEPS.map((l, i) => (
            <li key={l.en}>
              <button type="button" disabled={i > step} onClick={() => setStep(i)}
                className={cx(i === step ? 'font-extrabold text-primary' : i < step ? 'font-semibold text-indigo hover:underline' : 'font-semibold text-muted-foreground')}>{t(l.en, l.th)}</button>
            </li>
          ))}
        </ol>
        <div className="flex h-1.5 gap-[5px]" aria-hidden>
          {STEPS.map((l, i) => <span key={l.en} className={cx('flex-1 rounded-full', i <= step ? 'bg-primary' : 'bg-[#e3d8ff]')} />)}
        </div>
        <p className="text-[13px] text-muted-foreground">{t(`Step ${step + 1} of 4 · ${STEPS[step].en}`, `ขั้นที่ ${step + 1} จาก 4 · ${STEPS[step].th}`)}</p>
      </div>

      {step === 0 && <InfoStep d={d} set={set} band={band} errOf={errOf} done={issues.length === 0} />}
      {step === 1 && <LinkStep d={d} set={set} errOf={errOf} />}
      {step === 2 && <EligibilityStep d={d} set={set} errOf={errOf} />}
      {step === 3 && q && <PreviewStep d={d} set={set} q={q} isFirstPost={info.isFirstPost} subsidy={info.subsidy} balance={me.balance} />}

      {/* สรุปข้อผิดพลาดรวมกล่องเดียว สีแดง */}
      <ErrorSummary title={t('Your survey needs a little more detail!', 'แบบสอบถามยังกรอกไม่ครบ!')} items={summary} />
      <ErrorText>{error}</ErrorText>

      {/* Actions */}
      <div className="flex gap-2.5 pt-1">
        <button type="button" onClick={back} className="flex h-[50px] flex-1 items-center justify-center rounded-[14px] border border-[#ddd4f7] bg-card text-[15px] font-bold text-indigo hover:bg-lavender-soft">
          {step === 0 ? t('Cancel', 'ยกเลิก') : t('Back', 'ย้อนกลับ')}
        </button>
        {step < 3 ? (
          <button type="button" onClick={next} className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-primary bg-primary text-[15px] font-bold text-white hover:bg-primary/90">
            <ArrowRight className="size-[17px]" />{step === 2 ? t('Preview', 'ตรวจทาน') : t('Continue', 'ถัดไป')}
          </button>
        ) : (
          <button type="button" onClick={publish} disabled={busy || me.balance < cost}
            className="flex h-[50px] flex-1 items-center justify-center gap-2 rounded-[14px] border border-primary bg-primary text-[15px] font-bold text-white hover:bg-primary/90 disabled:opacity-50">
            <Send className="size-[17px]" />{busy ? t('Publishing…', 'กำลังโพสต์…') : t('Publish Survey', 'โพสต์แบบสอบถาม')}
          </button>
        )}
      </div>

      {/* Figma: SURVEY / Draft Saved */}
      {saved && (
        <Modal label={t('Draft saved', 'บันทึกร่างแล้ว')} onClose={() => setSaved(null)}>
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-lavender text-primary"><FilePen className="size-7" /></span>
          <p className="mt-3 text-xl font-extrabold">{t('Draft Saved!', 'บันทึกร่างแล้ว!')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('Your changes are safe. Finish the remaining details whenever you’re ready.', 'ข้อมูลของคุณถูกเก็บไว้แล้ว กลับมากรอกส่วนที่เหลือได้ทุกเมื่อ')}</p>
          <div className="mt-4 space-y-2 rounded-2xl bg-lavender-soft/70 p-3 text-left">
            <p className="truncate text-[11px] font-bold text-primary uppercase">{saved.title || t('Untitled survey', 'แบบสอบถามที่ยังไม่มีชื่อ')}</p>
            <p className="text-sm font-extrabold">{t(`${saved.stepsDone} of 4 steps complete`, `ทำแล้ว ${saved.stepsDone} จาก 4 ขั้น`)}</p>
            <Progress value={(saved.stepsDone / 4) * 100} />
            <div className="flex justify-between pt-1 text-xs"><span className="flex items-center gap-1.5 text-muted-foreground"><Clock3 className="size-3.5" />{t('Last edited', 'แก้ไขล่าสุด')}</span><b>{fmtDate(saved.updatedAt)}</b></div>
            <div className="flex justify-between text-xs"><span className="flex items-center gap-1.5 text-muted-foreground"><ArrowRight className="size-3.5" />{t('Next step', 'ขั้นถัดไป')}</span><b>{t(STEPS[Math.min(3, saved.stepsDone)].en, STEPS[Math.min(3, saved.stepsDone)].th)}</b></div>
          </div>
          <div className="mt-4 flex gap-2">
            <Link href="/surveys?tab=mine" className="flex h-11 flex-1 items-center justify-center rounded-xl bg-lavender-soft px-3 text-center text-sm leading-tight font-bold text-indigo">{t('My Surveys', 'แบบสอบถามของฉัน')}</Link>
            <Button type="button" className="flex-1" onClick={() => setSaved(null)}>{t('Continue Edit', 'แก้ไขต่อ')}</Button>
          </div>
        </Modal>
      )}

      {/* Figma: SURVEY / Create — Preview (Published) */}
      {created && (
        <Modal label={t('Published', 'โพสต์แล้ว')}>
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success"><CheckCircle2 className="size-7" /></span>
          <p className="mt-3 text-xl font-extrabold">{t('Published your survey!', 'โพสต์แบบสอบถามแล้ว!')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('One last step: connect your Google Form so TEMBO knows when someone submits it. Your survey shows in the feed once it is connected.', 'เหลืออีกขั้นเดียว: เชื่อม Google Form เพื่อให้ TEMBO รู้เมื่อมีคนส่ง แบบสอบถามจะขึ้นฟีดหลังเชื่อมเสร็จ')}</p>
          <div className="mt-4 space-y-1.5 rounded-2xl bg-lavender-soft/70 p-3 text-left text-xs">
            <div className="flex justify-between"><span className="flex items-center gap-1.5 text-muted-foreground"><Users className="size-3.5" />{t('Participant limit', 'จำนวนผู้ตอบ')}</span><b>{t(`${created.quota} people`, `${created.quota} คน`)}</b></div>
            <div className="flex justify-between"><span className="flex items-center gap-1.5 text-muted-foreground"><Coins className="size-3.5" />{t('Reward budget', 'งบรางวัล')}</span><b>{created.targetPool.toLocaleString()} Coin</b></div>
            <div className="flex justify-between"><span className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="size-3.5" />{t('Closes', 'ปิดรับ')}</span><b>{fmtDMY(created.closesAt)}</b></div>
          </div>
          <Button type="button" className="mt-4 w-full" onClick={() => router.replace(`/surveys/${created.id}`)}><Link2 />{t('Connect Google Form', 'เชื่อม Google Form')}</Button>
          <Link href="/surveys?tab=mine" className="mt-2 block text-sm font-bold text-primary">{t('My Surveys', 'แบบสอบถามของฉัน')}</Link>
        </Modal>
      )}
    </div>
  );
}

type SetFn = <K extends keyof Draft>(k: K, v: Draft[K]) => void;
type ErrFn = (f: FieldKey) => string | undefined;
type Quote = NonNullable<ReturnType<typeof quoteSurvey>>;

/** Coin ที่ผู้โพสต์ลงเอง: สุ่มจับรางวัลต้องลงครบ / รางวัลเท่ากันลงตั้งแต่พอจ่าย 1 คนถึงเต็มยอด (ค่าเริ่มต้น = เต็มเท่าที่มี) */
function ownContribution(d: Draft, q: Quote, balance: number) {
  if (d.rewardMode === 'DRAW') return q.maxOwnerContribution;
  const want = d.contribution ?? Math.max(q.minOwnerContribution, Math.min(q.maxOwnerContribution, balance - q.postFee));
  return Math.min(q.maxOwnerContribution, Math.max(q.minOwnerContribution, want));
}

const Panel = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <section className={cx('space-y-2.5 rounded-2xl bg-card p-3.5 shadow-[0_8px_24px_rgba(43,23,96,0.07)]', className)}>{children}</section>
);

/** ช่องกรอก: ป้าย (+ ดอกจันแดง) · ช่อง · ข้อความเตือนใต้ช่อง */
function F({ label, required, error, children, className = '' }: { label: string; required?: boolean; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex min-w-0 flex-1 flex-col gap-[5px]', className)}>
      <span className="text-xs font-bold text-indigo">{label}{required && <Req />}</span>
      {children}
      <FieldError>{error}</FieldError>
    </div>
  );
}

function NumberBox({ icon, value, onChange, suffix, label, min = 1, max, invalid }: { icon: ReactNode; value: number; onChange: (n: number) => void; suffix?: string; label: string; min?: number; max?: number; invalid?: boolean }) {
  return (
    <div className={fieldBox(invalid)}>
      <span className="text-muted-foreground [&_svg]:size-[17px]">{icon}</span>
      <input aria-label={label} aria-invalid={invalid || undefined} type="number" inputMode="numeric" min={min} max={max} value={num(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))} className={bareInput} />
      {suffix && <span className="text-muted-foreground">{suffix}</span>}
    </div>
  );
}

// ───────── ขั้นที่ 1: ข้อมูล (Figma: SURVEY / Create Information) ─────────

function InfoStep({ d, set, band, errOf, done }: { d: Draft; set: SetFn; band: ReturnType<typeof surveyBand>; errOf: ErrFn; done: boolean }) {
  const { t, p } = useT();
  const [tagsOpen, setTagsOpen] = useState(false);
  const draw = d.rewardMode === 'DRAW';
  const total = d.prizes.reduce((a, b) => a + (num(b) ? b : 0), 0);
  return (
    <Panel>
      <F label={t('Survey title', 'ชื่อแบบสอบถาม')} required error={errOf('title')}>
        <div className={fieldBox(!!errOf('title'))}>
          <input aria-label={t('Survey title', 'ชื่อแบบสอบถาม')} aria-invalid={!!errOf('title') || undefined} className={bareInput} maxLength={150} value={d.title}
            onChange={(e) => set('title', e.target.value)} placeholder={t('e.g. Campus Learning Experience 2026', 'เช่น ประสบการณ์การเรียนในมหาวิทยาลัย 2569')} />
        </div>
      </F>
      <F label={t('Description', 'รายละเอียด')} required error={errOf('description')}>
        <textarea aria-label={t('Description', 'รายละเอียด')} aria-invalid={!!errOf('description') || undefined}
          className={cx(fieldBox(!!errOf('description')), 'h-[72px] resize-none items-start py-[11px] leading-[1.35] outline-none')} maxLength={2000}
          value={d.description} onChange={(e) => set('description', e.target.value)}
          placeholder={t('Who should answer, and how will the data be used?', 'ใครควรตอบ และข้อมูลจะนำไปใช้อย่างไร')} />
      </F>
      <div className="flex gap-2">
        <F label={t('Category', 'หมวดหมู่')} required error={errOf('category')}>
          <Select label={t('Category', 'หมวดหมู่')} icon={<Shapes />} placeholder={t('Select', 'เลือก')} invalid={!!errOf('category')} value={d.category || null}
            options={(Object.keys(SURVEY_CATEGORIES) as SurveyCategory[]).map((k) => ({ value: k, label: p(SURVEY_CATEGORIES[k]) }))} onChange={(v) => set('category', v)} />
        </F>
        <F label={t('Tags', 'แท็ก')}>
          <button type="button" aria-expanded={tagsOpen} onClick={() => setTagsOpen(!tagsOpen)} className={cx(fieldBox(false), 'text-left')}>
            <Tag className="size-[17px] shrink-0 text-muted-foreground" />
            <span className={cx('min-w-0 flex-1 truncate', !d.tags.length && 'text-muted-foreground')}>{d.tags.length ? d.tags.map((x) => p(interestLabel(x))).join(', ') : t('Choose topics', 'เลือกหัวข้อ')}</span>
          </button>
        </F>
      </div>
      {tagsOpen && (
        <div className="rounded-[14px] bg-lavender-soft p-2.5">
          <p className="mb-1.5 text-[11px] text-muted-foreground">{t('Up to 5 · used to match people’s interests in the feed', 'เลือกได้ไม่เกิน 5 · ใช้จับคู่กับความสนใจของผู้ตอบในฟีด')}</p>
          <div className="flex flex-wrap gap-1.5">
            {INTERESTS.map((x) => (
              <button key={x} type="button" aria-pressed={d.tags.includes(x)}
                onClick={() => set('tags', d.tags.includes(x) ? d.tags.filter((y) => y !== x) : d.tags.length >= 5 ? d.tags : [...d.tags, x])}
                className={cx('rounded-full px-3 py-1.5 text-xs font-bold', d.tags.includes(x) ? 'bg-primary text-white' : 'bg-card text-primary')}>{p(interestLabel(x))}</button>
            ))}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <F label={t('Est. completion', 'เวลาทำโดยประมาณ')} required error={errOf('estMinutes')}>
          <Select label={t('Est. completion', 'เวลาทำโดยประมาณ')} icon={<Clock3 />} placeholder={t('Select', 'เลือก')} invalid={!!errOf('estMinutes')}
            value={d.estMinutes || null} options={EST_MINUTES.map((e) => ({ value: e.value as number, label: p(e.label) }))} onChange={(v) => set('estMinutes', v)} />
        </F>
        <F label={t('Expiration', 'วันปิดรับ')} required error={errOf('closesOn')}>
          <DateField label={t('Expiration date', 'วันปิดรับ')} value={d.closesOn} min={dateInput(new Date())} invalid={!!errOf('closesOn')} onChange={(v) => set('closesOn', v)} />
        </F>
      </div>

      {/* รูปแบบรางวัล: เท่ากัน / สุ่มจับรางวัล */}
      <div className="flex flex-col gap-[5px]">
        <span className="text-xs font-bold text-indigo">{t('Reward type', 'รูปแบบรางวัล')}<Req /></span>
        <div role="radiogroup" aria-label={t('Reward type', 'รูปแบบรางวัล')} className="grid grid-cols-2 gap-1 rounded-[14px] bg-lavender-soft p-1">
          {(['EQUAL', 'DRAW'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={d.rewardMode === m} onClick={() => set('rewardMode', m)}
              className={cx('flex h-10 items-center justify-center gap-1.5 rounded-[11px] text-[13px] font-bold', d.rewardMode === m ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground')}>
              {m === 'EQUAL' ? <Coins className="size-4" /> : <Gift className="size-4" />}{p(REWARD_MODE_LABEL[m])}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <F label={t('Participant count', 'จำนวนผู้ตอบ')} required error={errOf('quota')}>
          <NumberBox label={t('Participant count', 'จำนวนผู้ตอบ')} icon={<Users />} value={d.quota} max={SURVEY_RULES.MAX_QUOTA} invalid={!!errOf('quota')}
            onChange={(n) => set('quota', n)} suffix={t('people', 'คน')} />
        </F>
        {draw ? (
          <F label={t('Total prizes', 'รางวัลรวม')}>
            <div className={cx(fieldBox(false), 'bg-lavender-soft/60')}><Coins className="size-[17px] text-muted-foreground" /><span className="flex-1">{total.toLocaleString()} Coin</span></div>
          </F>
        ) : (
          <F label={t('Reward / participant', 'รางวัล / คน')} required error={errOf('reward')}>
            <NumberBox label={t('Reward per participant', 'รางวัลต่อคน')} icon={<Coins />} value={d.reward} max={SURVEY_RULES.MAX_REWARD} invalid={!!errOf('reward')}
              onChange={(n) => set('reward', n)} suffix="Coin" />
          </F>
        )}
      </div>
      {draw ? (
        <div className="space-y-1.5 rounded-[14px] bg-lavender-soft p-2.5">
          <p className="text-[11px] text-muted-foreground">{t('Winners are drawn from everyone who submitted when the survey closes. Everyone has the same chance.', 'ระบบสุ่มผู้ได้รางวัลจากทุกคนที่ส่งแบบสอบถามตอนปิดรับ — ทุกคนมีโอกาสเท่ากัน')}</p>
          {d.prizes.map((pz, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-xs font-bold text-indigo">{t(`Prize #${i + 1}`, `อันดับ ${i + 1}`)}</span>
              <div className={cx(fieldBox(!!errOf('prizes') && (!num(pz) || pz < 1)), 'h-10')}>
                <input aria-label={t(`Prize #${i + 1}`, `รางวัลอันดับ ${i + 1}`)} type="number" min={1} max={DRAW_RULES.MAX_PRIZE} value={num(pz) ? pz : ''}
                  onChange={(e) => set('prizes', d.prizes.map((x, j) => j === i ? (e.target.value === '' ? NaN : Number(e.target.value)) : x))} className={bareInput} />
                <span className="text-muted-foreground">Coin</span>
              </div>
              <button type="button" aria-label={t(`Remove prize #${i + 1}`, `ลบอันดับ ${i + 1}`)} disabled={d.prizes.length <= 1} onClick={() => set('prizes', d.prizes.filter((_, j) => j !== i))}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-card disabled:opacity-30"><Minus className="size-4" /></button>
            </div>
          ))}
          {d.prizes.length < DRAW_RULES.MAX_PRIZES && (
            <button type="button" onClick={() => set('prizes', [...d.prizes, d.prizes.at(-1) || 10])} className="flex items-center gap-1 text-xs font-bold text-primary"><Plus className="size-4" />{t('Add prize', 'เพิ่มรางวัล')}</button>
          )}
          <FieldError>{errOf('prizes')}</FieldError>
        </div>
      ) : band && <p className="text-[11px] text-muted-foreground">{t(`Suggested ${band.suggestedReward} Coin per person for ${d.questionCount} questions (minimum ${band.minReward}; set the question count in the next step).`, `แนะนำ ${band.suggestedReward} Coin/คน สำหรับ ${d.questionCount} ข้อ (ขั้นต่ำ ${band.minReward} — ตั้งจำนวนข้อในขั้นถัดไป)`)}</p>}
      {done && <p className="text-[11px] font-semibold text-success">✓ {t('All required details are complete', 'กรอกข้อมูลที่จำเป็นครบแล้ว')}</p>}
    </Panel>
  );
}

// ───────── ขั้นที่ 2: ลิงก์ (Figma: SURVEY / Create — External Link) ─────────

function LinkStep({ d, set, errOf }: { d: Draft; set: SetFn; errOf: ErrFn }) {
  const { t } = useT();
  const valid = isGoogleFormUrl(d.formUrl);
  return (
    <>
      <Panel className="space-y-3">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-lavender text-primary"><Link2 className="size-5" /></span>
          <div>
            <h2 className="text-[15px] font-extrabold">{t('External survey link', 'ลิงก์แบบสอบถาม')}</h2>
            <p className="text-xs text-muted-foreground">{t('Paste the link people use to answer your Google Form.', 'วางลิงก์ที่ใช้ตอบ Google Form ของคุณ')}</p>
          </div>
        </div>
        <F label={t('Google Form link', 'ลิงก์ Google Form')} required error={errOf('formUrl')}>
          <div className={fieldBox(!!errOf('formUrl'))}>
            <Globe2 className="size-[17px] shrink-0 text-muted-foreground" />
            <input type="url" aria-label={t('Google Form link', 'ลิงก์ Google Form')} aria-invalid={!!errOf('formUrl') || undefined} value={d.formUrl}
              onChange={(e) => set('formUrl', e.target.value)} placeholder="https://forms.gle/…" className={bareInput} />
            {valid && <CheckCircle2 className="size-[17px] shrink-0 text-success" />}
          </div>
        </F>
        <F label={t('Number of questions', 'จำนวนข้อในฟอร์ม')} required error={errOf('questionCount')}>
          <NumberBox label={t('Number of questions', 'จำนวนข้อในฟอร์ม')} icon={<Shapes />} value={d.questionCount} max={SURVEY_RULES.MAX_QUESTIONS}
            invalid={!!errOf('questionCount')} onChange={(n) => set('questionCount', n)} suffix={t('questions', 'ข้อ')} />
        </F>
        <div className="rounded-[14px] bg-lavender-soft p-3 text-indigo">
          <p className="text-xs font-extrabold">{t('How TEMBO checks submissions', 'TEMBO รู้ได้อย่างไรว่าส่งฟอร์มแล้ว')}</p>
          <p className="mt-1 text-xs leading-relaxed">{t('After you publish, you will paste a short script into your Google Form once. It adds a “TEMBO code” question for you and tells TEMBO each time someone submits, so participants get their Coin automatically.', 'หลังโพสต์ คุณจะวางสคริปต์สั้น ๆ ใน Google Form 1 ครั้ง สคริปต์จะเพิ่มคำถาม “รหัส TEMBO” ให้เอง และแจ้ง TEMBO ทุกครั้งที่มีคนส่ง ผู้ตอบจึงได้รับ Coin อัตโนมัติ')}</p>
        </div>
      </Panel>
      <p className="flex items-start gap-2 rounded-2xl bg-lavender-soft p-3 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-[18px] shrink-0 text-primary" />{t('TEMBO does not store your form answers. They stay in your Google Form; TEMBO only knows who submitted.', 'TEMBO ไม่เก็บคำตอบของฟอร์ม คำตอบอยู่ใน Google Form ของคุณ — TEMBO รู้เพียงว่าใครส่งแล้ว')}
      </p>
    </>
  );
}

// ───────── ขั้นที่ 3: ผู้ตอบ (Figma: SURVEY / Create — Eligibility) ─────────

function EligibilityStep({ d, set, errOf }: { d: Draft; set: SetFn; errOf: ErrFn }) {
  const { t, p } = useT();
  const count = 1 + Number(d.limitFaculty) + Number(d.limitYear) + Number(d.tags.length > 0);
  return (
    <>
      <Panel className="space-y-1">
        <div className="flex items-start justify-between gap-2 pb-1">
          <div>
            <h2 className="text-[15px] font-extrabold">{t('Who can participate', 'ใครตอบได้บ้าง')}</h2>
            <p className="text-[11px] text-muted-foreground">{t('No limits = open to everyone who has verified their CMU email', 'ไม่จำกัด = เปิดให้ทุกคนที่ยืนยัน มช. แล้ว')}</p>
          </div>
          <span className="shrink-0 rounded-full bg-lavender px-2.5 py-1 text-[11px] font-bold text-primary">{t(`${count} selected`, `${count} เงื่อนไข`)}</span>
        </div>
        <Requirement checked locked label={t('Verified @cmu.ac.th email', 'ยืนยันอีเมล @cmu.ac.th แล้ว')} description={t('Required for every survey to stop fake accounts', 'บังคับทุกแบบสอบถาม กันบัญชีปลอมมารับ Coin')} />
        <Requirement checked={d.limitFaculty} onToggle={() => set('limitFaculty', !d.limitFaculty)} label={t('Limit by faculty', 'จำกัดคณะ')}
          description={d.limitFaculty && d.faculties.length ? d.faculties.map((f) => p(facultyLabel(f))).join(', ') : t('Only selected faculties', 'เลือกเฉพาะคณะที่ต้องการ')} />
        {d.limitFaculty && (
          <div className="space-y-1.5 pb-2 pl-[34px]">
            <div className="flex flex-wrap gap-1.5">
              {FACULTIES.map((f) => (
                <button key={f} type="button" aria-pressed={d.faculties.includes(f)} onClick={() => set('faculties', d.faculties.includes(f) ? d.faculties.filter((x) => x !== f) : [...d.faculties, f])}
                  className={cx('rounded-full px-2.5 py-1 text-[11px] font-bold', d.faculties.includes(f) ? 'bg-primary text-white' : 'bg-lavender-soft text-primary')}>{p(facultyLabel(f))}</button>
              ))}
            </div>
            <FieldError>{errOf('faculties')}</FieldError>
          </div>
        )}
        <Requirement checked={d.limitYear} onToggle={() => set('limitYear', !d.limitYear)} label={t('Limit by year of study', 'จำกัดชั้นปี')}
          description={d.limitYear && d.years.length ? t(`Year ${[...d.years].sort().join(', ')}`, `ปี ${[...d.years].sort().join(', ')}`) : t('Only selected years', 'เลือกเฉพาะชั้นปีที่ต้องการ')} />
        {d.limitYear && (
          <div className="space-y-1.5 pb-2 pl-[34px]">
            <div className="flex flex-wrap gap-1.5">
              {STUDY_YEARS.map((y) => (
                <button key={y} type="button" aria-pressed={d.years.includes(y)} onClick={() => set('years', d.years.includes(y) ? d.years.filter((x) => x !== y) : [...d.years, y])}
                  className={cx('min-w-12 rounded-full px-3 py-1 text-xs font-bold', d.years.includes(y) ? 'bg-primary text-white' : 'bg-lavender-soft text-primary')}>{t(`Year ${y}`, `ปี ${y}`)}{y === 6 ? '+' : ''}</button>
              ))}
            </div>
            <FieldError>{errOf('years')}</FieldError>
          </div>
        )}
        <div className="flex flex-col gap-[5px] pt-2">
          <span className="text-xs font-bold text-indigo">{t('Matching interests', 'ความสนใจที่ตรงกัน')}</span>
          <div className="min-h-[72px] rounded-[14px] border-[1.2px] border-[#ddd4f7] px-[13px] py-[11px] text-[13px] leading-[1.35]">
            {d.tags.length ? d.tags.map((x) => p(interestLabel(x))).join(', ') : <span className="text-muted-foreground">{t('No tags yet (choose them in Info)', 'ยังไม่ได้เลือกแท็ก (เลือกได้ในขั้นข้อมูล)')}</span>}
          </div>
          <p className="text-[11px] text-muted-foreground">{t('This does not limit who can answer. It moves your survey up in “Your Feed” for people with these interests.', 'ไม่ได้จำกัดว่าใครตอบได้ แต่ดันขึ้น “ฟีดของคุณ” ของคนที่สนใจหัวข้อนี้')}</p>
        </div>
      </Panel>
      <p className="flex items-start gap-2 rounded-2xl bg-lavender-soft p-3 text-xs text-muted-foreground">
        <UserCheck className="mt-0.5 size-[18px] shrink-0 text-primary" />{t('People outside these groups will not see the survey in their feed and cannot start it.', 'คนที่ไม่อยู่ในกลุ่มจะไม่เห็นแบบสอบถามนี้ในฟีด และกดเริ่มทำไม่ได้')}
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
  d: Draft; set: SetFn; q: Quote; isFirstPost: boolean; subsidy: SurveyQuoteResponse['subsidy']; balance: number;
}) {
  const { t, p } = useT();
  const draw = d.rewardMode === 'DRAW';
  const own = ownContribution(d, q, balance);
  const cost = q.postFee + own;
  const friends = q.maxOwnerContribution - own;
  const est = estMinutesLabel(d.estMinutes);
  const who = [
    d.limitFaculty && d.faculties.length ? d.faculties.map((f) => p(facultyLabel(f))).join(', ') : null,
    d.limitYear && d.years.length ? t(`Year ${[...d.years].sort().join(', ')}`, `ปี ${[...d.years].sort().join(', ')}`) : null,
  ].filter(Boolean);
  return (
    <>
      <Panel className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-lavender px-2.5 py-1 text-[11px] font-bold text-primary">{d.category ? p(SURVEY_CATEGORIES[d.category]) : '—'}</span>
          <span className="flex items-center gap-1.5 rounded-full bg-coin-soft px-2.5 py-1.5 text-[13px] font-extrabold"><span className="size-[17px] rounded-full bg-coin" />{draw ? t(`Win up to ${Math.max(...d.prizes)}`, `ลุ้น ${Math.max(...d.prizes)}`) : `+${d.reward}`} Coin</span>
        </div>
        <div>
          <h2 className="text-lg leading-snug font-extrabold">{d.title}</h2>
          <p className="mt-1 line-clamp-3 text-[13px] text-muted-foreground">{d.description}</p>
        </div>
        {d.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{d.tags.map((x) => <span key={x} className="rounded-full bg-lavender-soft px-2 py-1 text-[11px] font-bold text-primary">{p(interestLabel(x))}</span>)}</div>}
        <hr className="border-border" />
        <Detail icon={<Clock3 />} label={t('Est. completion', 'เวลาทำโดยประมาณ')} value={est ? p(est) : '—'} />
        <Detail icon={<Calendar />} label={t('Expiration', 'ปิดรับ')} value={d.closesOn ? fmtDMY(`${d.closesOn}T12:00:00+07:00`) : '—'} />
        <Detail icon={<Users />} label={t('Participants', 'จำนวนผู้ตอบ')} value={t(`${d.quota} people`, `${d.quota} คน`)} />
        <Detail icon={<Coins />} label={draw ? t(`Lucky draw · ${d.prizes.length} prizes`, `สุ่มจับรางวัล ${d.prizes.length} รางวัล`) : t('Reward per participant', 'รางวัลต่อคน')} value={draw ? d.prizes.join(' / ') : `${d.reward} Coin`} />
        <hr className="border-border" />
        <p className="flex items-center gap-2 text-xs"><Link2 className="size-[17px] shrink-0 text-primary" /><span className="min-w-0 flex-1 truncate text-muted-foreground">{d.formUrl}</span><CheckCircle2 className="size-[17px] shrink-0 text-success" /></p>
        <p className="flex items-center gap-2 text-xs"><UserCheck className="size-[17px] shrink-0 text-primary" /><span className="text-muted-foreground">{t('CMU verified', 'ยืนยัน มช. แล้ว')}{who.length ? ` · ${who.join(' · ')}` : ` · ${t('All faculties and years', 'ทุกคณะ ทุกชั้นปี')}`}</span></p>
      </Panel>

      <Panel>
        <h3 className="text-[15px] font-extrabold">{t('Coin needed', 'Coin ที่ใช้')}</h3>
        <label className={cx('flex gap-3 rounded-xl border p-3', subsidy.eligible ? 'border-primary/30 bg-lavender-soft/50' : 'border-border opacity-60')}>
          <input type="checkbox" className="mt-0.5 accent-primary" disabled={!subsidy.eligible} checked={d.requestSubsidy} onChange={(e) => set('requestSubsidy', e.target.checked)} />
          <span className="text-xs">
            <b>{t('Request the launch subsidy', 'ขอระบบสมทบช่วงเปิดตัว')}</b> — {t(`TEMBO pays half, up to ${SURVEY_RULES.SUBSIDY_MAX_AMOUNT} Coin`, `TEMBO ช่วยครึ่งหนึ่ง สูงสุด ${SURVEY_RULES.SUBSIDY_MAX_AMOUNT} Coin`)}
            <span className="mt-0.5 block text-muted-foreground">{subsidy.reason ?? t('An admin checks that it is real research first. Responses open after the review.', 'แอดมินตรวจก่อนว่าเป็นงานวิจัยจริง ระหว่างนั้นยังไม่รับคำตอบ')}</span>
          </span>
        </label>
        <dl className="space-y-1.5 text-[13px]">
          <Row k={draw ? t('Total prizes (paid up front)', 'รางวัลรวม (ลงครบตั้งแต่แรก)') : t(`Reward pool (${d.reward} × ${d.quota} people)`, `รางวัลรวม (${d.reward} × ${d.quota} คน)`)} v={q.targetPool} />
          {q.subsidyAmount > 0 && <Row k={t('Subsidy (once approved)', 'ระบบสมทบ (เมื่ออนุมัติ)')} v={-q.subsidyAmount} />}
          <Row k={isFirstPost ? t('Posting fee (first post free)', 'ค่าโพสต์ (โพสต์แรกฟรี)') : t('Posting fee', 'ค่าโพสต์')} v={q.postFee} />
          {!draw && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <dt>{t('You put in', 'คุณลง Coin เอง')}<span className="block text-[11px] text-muted-foreground">{q.minOwnerContribution}–{q.maxOwnerContribution} · {t('friends can sponsor the rest', 'ที่ขาดให้เพื่อนช่วยสนับสนุนได้')}</span></dt>
              <dd><input type="number" aria-label={t('Coin you put in', 'Coin ที่ลงเอง')} min={q.minOwnerContribution} max={q.maxOwnerContribution} value={own}
                onChange={(e) => set('contribution', Number(e.target.value))} className="h-10 w-24 rounded-xl border border-[#ddd4f7] px-2 text-right font-bold outline-none focus:border-primary" /></dd>
            </div>
          )}
          {friends > 0 && <Row k={t('Waiting for sponsors', 'รอเพื่อนสนับสนุน')} v={friends} />}
          <div className="border-t border-border pt-1.5"><Row k={t('Charged when you publish', 'หักจากกระเป๋าตอนโพสต์')} v={cost} bold /></div>
          <Row k={t('Balance after publishing', 'คงเหลือหลังโพสต์')} v={balance - cost} />
        </dl>
        {balance < cost && <ErrorText>{t(`Not enough Coin (you have ${balance.toLocaleString()})`, `Coin ไม่พอ (มี ${balance.toLocaleString()})`)}</ErrorText>}
        <p className="text-[11px] text-muted-foreground">{t('Leftover Coin comes back to you when the survey closes. The posting fee is not refunded.', 'Coin ที่เหลือตอนปิดรับคืนให้คุณ · ค่าโพสต์ไม่คืน')}</p>
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
