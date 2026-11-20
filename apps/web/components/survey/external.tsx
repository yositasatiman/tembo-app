'use client';
import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, Check, Coins, Copy, ExternalLink, Link2, RefreshCw } from 'lucide-react';
import type { ExternalStartResponse, SurveyDetail } from '@tembo/shared';
import { post } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button, Card, inputCls, Modal, Progress } from '../ui';

/** ผู้โพสต์: รหัสยืนยันที่ต้องใส่ในข้อความยืนยันของฟอร์ม */
export function ExternalOwnerSetup({ s }: { s: SurveyDetail }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const text = t(`TEMBO confirmation code: ${s.completionCode}`, `รหัสยืนยัน TEMBO: ${s.completionCode}`);
  return (
    <Card className="space-y-3">
      <h3 className="flex items-center gap-2 font-extrabold"><Link2 className="size-4 text-primary" />{t('Set up your form', 'ตั้งค่าฟอร์มของคุณ')}</h3>
      <div className="flex items-center justify-between gap-3 rounded-2xl bg-lavender-soft p-4">
        <div>
          <p className="text-xs text-muted-foreground">{t('Confirmation code', 'รหัสยืนยัน')}</p>
          <p className="font-mono text-2xl font-extrabold tracking-[0.3em]">{s.completionCode}</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={async () => { await navigator.clipboard.writeText(text).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
          {copied ? <><Check />{t('Copied', 'คัดลอกแล้ว')}</> : <><Copy />{t('Copy', 'คัดลอก')}</>}
        </Button>
      </div>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>{t('Open ', 'เปิด ')}<a href={s.externalUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline">{t('your form', 'ฟอร์มของคุณ')}</a>{t(' in edit mode', ' ในโหมดแก้ไข')}</li>
        <li>{t('In Google Forms: ', 'Google Forms: ')}<b>{t('Settings → Presentation → Confirmation message', 'การตั้งค่า → การนำเสนอ → ข้อความยืนยัน')}</b>{t(', then paste ', ' แล้ววาง ')}“{text}”</li>
        <li>{t('(Recommended) Add a short question “TEMBO reference code” so you can match answers with the CSV file', '(แนะนำ) เพิ่มคำถามสั้น “รหัสอ้างอิง TEMBO” เพื่อเทียบกับไฟล์ CSV ว่าใครตอบจริง')}</li>
      </ol>
      <p className="text-xs text-muted-foreground">{t('Do not share this code anywhere else. Participants only see it after submitting the form.', 'อย่าเผยแพร่รหัสนี้ที่อื่น ผู้ตอบจะเห็นรหัสหลังส่งฟอร์มเท่านั้น')}</p>
    </Card>
  );
}

type Phase = 'idle' | 'checking' | 'error' | 'done';

/** ผู้ตอบ: เปิดฟอร์มภายนอก → กลับมากรอกรหัสยืนยัน → รับ Coin (Figma: Submission verification) */
export function ExternalRespond({ s, onDone }: { s: SurveyDetail; onDone: (reward: number) => void }) {
  const { t } = useT();
  const [start, setStart] = useState<ExternalStartResponse | null>(s.myStart);
  const [code, setCode] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const [reward, setReward] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const wait = start ? Math.max(0, Math.ceil((new Date(start.canVerifyAt).getTime() - now) / 1000)) : 0;

  async function open() {
    // เปิดแท็บทันทีที่กด (กันเบราว์เซอร์บล็อกป๊อปอัป) แล้วค่อยใส่ลิงก์หลังบันทึกเวลาเริ่ม
    const tab = window.open('', '_blank');
    try {
      const r = await post<ExternalStartResponse>(`/surveys/${s.id}/start`);
      setStart(r);
      if (tab) { tab.opener = null; tab.location.href = r.url; } else window.location.href = r.url;
    } catch (e) { tab?.close(); setMessage((e as Error).message); setPhase('error'); }
  }

  async function verify(e?: FormEvent) {
    e?.preventDefault();
    setPhase('checking');
    const minDelay = new Promise((r) => setTimeout(r, 900));
    try {
      const [res] = await Promise.all([post<{ reward: number }>(`/surveys/${s.id}/verify`, { code }), minDelay]);
      setReward(res.reward); setPhase('done');
    } catch (err) {
      await minDelay;
      setMessage((err as Error).message); setPhase('error');
      setStart((st) => st && /รหัสยืนยันไม่ถูกต้อง|Wrong confirmation code/.test((err as Error).message) ? { ...st, attemptsLeft: Math.max(0, st.attemptsLeft - 1) } : st);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h3 className="font-extrabold">{t('Take the survey', 'ตอบแบบสอบถาม')}</h3>
        <p className="text-sm text-muted-foreground">{t(`${s.questionCount} questions · submit the form, then enter the confirmation code from its last page to get ${s.rewardPerResponse} Coin`, `${s.questionCount} ข้อ · ส่งฟอร์มแล้วกรอกรหัสยืนยันที่หน้าสุดท้าย รับ ${s.rewardPerResponse} Coin`)}</p>
      </div>
      <Step n={1} title={t('Open the survey and finish it', 'เปิดแบบสอบถามแล้วทำให้เสร็จ')} done={!!start}>
        <Button type="button" variant={start ? 'outline' : 'primary'} onClick={open}><ExternalLink />{start ? t('Open the survey again', 'เปิดแบบสอบถามอีกครั้ง') : t('Open the survey', 'เปิดแบบสอบถาม')}</Button>
        {start && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('Your reference code', 'รหัสอ้างอิงของคุณ')} <b className="font-mono text-sm text-indigo">{start.refCode}</b> — {t('if the form asks for a “TEMBO reference code”, enter this', 'ถ้าฟอร์มมีช่อง “รหัสอ้างอิง TEMBO” ให้กรอกรหัสนี้')}
          </p>
        )}
      </Step>
      <Step n={2} title={t('Enter the confirmation code from the form’s last page', 'กรอกรหัสยืนยันจากหน้าสุดท้ายของฟอร์ม')} done={false}>
        <form onSubmit={verify} className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
            disabled={!start || start.attemptsLeft === 0} aria-label={t('Confirmation code', 'รหัสยืนยัน')} placeholder={t('e.g. K7M2QX', 'เช่น K7M2QX')} autoComplete="off"
            className={`${inputCls} font-mono tracking-widest uppercase`} />
          <Button disabled={!start || code.length < 4 || wait > 0 || start.attemptsLeft === 0}>{wait > 0 ? t(`Wait ${wait}s`, `รอ ${wait} วิ`) : t('Confirm', 'ยืนยัน')}</Button>
        </form>
        {start && start.attemptsLeft < 5 && <p className="mt-1 text-xs text-destructive">{t(`${start.attemptsLeft} tries left`, `กรอกผิดได้อีก ${start.attemptsLeft} ครั้ง`)}</p>}
      </Step>

      {phase === 'checking' && (
        <Modal label={t('Checking', 'กำลังตรวจสอบ')}>
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-lavender text-primary"><RefreshCw className="size-7 animate-spin" /></span>
          <p className="mt-4 text-xl font-extrabold">{t('Checking your submission…', 'กำลังตรวจสอบการส่งแบบสอบถาม…')}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t('One moment, TEMBO is confirming your response.', 'รอสักครู่ TEMBO กำลังยืนยันคำตอบของคุณ')}</p>
          <Progress value={65} className="mt-5 animate-pulse" />
        </Modal>
      )}
      {phase === 'error' && (
        <Modal label={t('Unable to verify', 'ตรวจสอบไม่ผ่าน')} onClose={() => setPhase('idle')}>
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive-soft text-destructive"><AlertCircle className="size-7" /></span>
          <p className="mt-4 text-xl font-extrabold">{t('Unable to verify', 'ตรวจสอบไม่ผ่าน')}</p>
          <p className="mt-2 text-sm text-muted-foreground">{message || t('Make sure you submitted the survey.', 'ตรวจว่าส่งแบบสอบถามเรียบร้อยแล้ว')}</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setPhase('idle')}>{t('Try again', 'ลองอีกครั้ง')}</Button>
            <Button type="button" onClick={() => { setPhase('idle'); open(); }}>{t('Back to the form', 'กลับไปที่ฟอร์ม')}</Button>
          </div>
        </Modal>
      )}
      {phase === 'done' && (
        <Modal label={t('Reward received', 'ได้รับรางวัล')} onClose={() => onDone(reward)}>
          <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-coin-soft text-warning"><Coins className="size-7" /></span>
          <p className="mt-4 text-xl font-extrabold">{t(`You got +${reward} Coin!`, `ได้รับ +${reward} Coin!`)}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t('Thanks for helping a fellow CMU researcher!', 'ขอบคุณที่ช่วยงานวิจัยของเพื่อนชาว มช.')}</p>
          <Button type="button" className="mt-5 w-full" onClick={() => onDone(reward)}>{t('Great!', 'เยี่ยมเลย')}</Button>
        </Modal>
      )}
    </Card>
  );
}

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${done ? 'bg-success text-white' : 'bg-lavender text-primary'}`}>{done ? <Check className="size-4" /> : n}</span>
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-bold">{title}</p>
        {children}
      </div>
    </div>
  );
}
