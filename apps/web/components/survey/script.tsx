'use client';
import { useEffect, useState } from 'react';
import { Check, CheckCircle2, Copy, ExternalLink, Gift, Hourglass, Plug, RefreshCw } from 'lucide-react';
import type { ExternalStartResponse, SurveyDetail } from '@tembo/shared';
import { post } from '@/lib/api';
import { Button, Card, cx } from '../ui';
import { buildFormScript } from './form-script';

function CopyButton({ text, label = 'คัดลอก' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button type="button" variant="outline" size="sm"
      onClick={async () => { await navigator.clipboard.writeText(text).catch(() => undefined); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
      {copied ? <><Check />คัดลอกแล้ว</> : <><Copy />{label}</>}
    </Button>
  );
}

/** โหลดข้อมูลใหม่ทุก 5 วินาทีระหว่างรอ (หยุดเมื่อ active เป็น false) */
function usePoll(active: boolean, reload: () => void) {
  useEffect(() => {
    if (!active) return;
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [active, reload]);
}

/** ผู้โพสต์: ติดตั้ง Apps Script ใน Google Form เพื่อให้ TEMBO รู้เมื่อมีคนส่งฟอร์ม */
export function ScriptOwnerSetup({ s, reload }: { s: SurveyDetail; reload: () => void }) {
  const sc = s.script!;
  const connected = !!sc.connectedAt;
  usePoll(!connected, reload);
  const code = buildFormScript(sc.endpoint, sc.secret);
  const editUrl = s.externalUrl?.replace(/\/viewform$/, '/edit');

  if (connected) {
    return (
      <Card className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success"><CheckCircle2 className="size-5" /></span>
        <div className="text-sm">
          <p className="font-extrabold">เชื่อม Google Form แล้ว</p>
          <p className="text-muted-foreground">เมื่อมีคนส่งฟอร์ม TEMBO จะ{s.rewardMode === 'DRAW' ? 'ให้สิทธิ์ลุ้นรางวัล' : 'ให้ Coin'}อัตโนมัติ · คำตอบอยู่ใน Google Form ของคุณ</p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-coin-soft text-warning"><Plug className="size-5" /></span>
        <div>
          <h3 className="font-extrabold">ขั้นสุดท้าย: เชื่อม Google Form กับ TEMBO</h3>
          <p className="text-sm text-muted-foreground">ทำครั้งเดียวประมาณ 3 นาที — ก่อนเชื่อมเสร็จ แบบสอบถามจะยังไม่ขึ้นฟีด</p>
        </div>
      </div>
      <ol className="space-y-3 text-sm">
        <SetupStep n={1}>เปิด <a href={editUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="font-bold text-primary underline">Google Form ในโหมดแก้ไข</a> → เมนู <b>⋮</b> มุมขวาบน → <b>ตัวแก้ไขสคริปต์ (Apps Script)</b></SetupStep>
        <SetupStep n={2}>
          ลบโค้ดเดิมทั้งหมด แล้ววางโค้ดนี้ → กด <b>บันทึก</b>
          <div className="mt-2 space-y-2">
            <pre className="max-h-40 overflow-auto rounded-xl bg-indigo p-3 text-[11px] leading-relaxed text-white/90">{code}</pre>
            <CopyButton text={code} label="คัดลอกโค้ด" />
          </div>
        </SetupStep>
        <SetupStep n={3}>เลือกฟังก์ชัน <code className="rounded bg-lavender-soft px-1.5 font-bold">setup</code> แล้วกด <b>Run</b> → อนุญาตสิทธิ์ด้วยบัญชี Google ของคุณ (ถ้าเจอ “Google ยังไม่ได้ยืนยันแอปนี้” กด ขั้นสูง → ไปที่โปรเจกต์)</SetupStep>
      </ol>
      <p className="flex items-center gap-2 rounded-xl bg-lavender-soft px-3 py-2.5 text-xs text-muted-foreground">
        <RefreshCw className="size-4 shrink-0 animate-spin text-primary" />กำลังรอสัญญาณจากสคริปต์… หน้านี้จะอัปเดตเองเมื่อเชื่อมสำเร็จ
      </p>
      <p className="text-xs text-muted-foreground">โค้ดมีรหัสลับของแบบสอบถามนี้ อย่าแชร์ให้คนอื่น</p>
    </Card>
  );
}

function SetupStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-lavender text-xs font-extrabold text-primary">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5">{children}</div>
    </li>
  );
}

/** ผู้ตอบ: เปิดฟอร์ม (รหัส TEMBO ใส่ให้แล้ว) → ส่งฟอร์ม → TEMBO รู้เองจากสคริปต์ */
export function ScriptRespond({ s, reload }: { s: SurveyDetail; reload: () => void }) {
  const [start, setStart] = useState<ExternalStartResponse | null>(s.myStart);
  const [error, setError] = useState('');
  const waiting = !!start && !s.hasResponded;
  usePoll(waiting, reload);
  useEffect(() => { if (s.myStart) setStart(s.myStart); }, [s.myStart]);
  const draw = s.rewardMode === 'DRAW';

  async function open() {
    setError('');
    const tab = window.open('', '_blank'); // เปิดทันทีที่กด กันเบราว์เซอร์บล็อกป๊อปอัป
    try {
      const r = await post<ExternalStartResponse>(`/surveys/${s.id}/start`);
      setStart(r);
      if (tab) { tab.opener = null; tab.location.href = r.url; } else window.location.href = r.url;
    } catch (e) { tab?.close(); setError((e as Error).message); }
  }

  if (s.hasResponded) {
    return (
      <Card className="flex items-start gap-3">
        <span className={cx('flex size-10 shrink-0 items-center justify-center rounded-xl', draw ? 'bg-coin-soft text-warning' : 'bg-success-soft text-success')}>{draw ? <Gift className="size-5" /> : <CheckCircle2 className="size-5" />}</span>
        <div className="text-sm">
          <p className="font-extrabold">{draw ? (s.drawnAt ? (s.myPrizeRank ? `ได้รางวัลอันดับ ${s.myPrizeRank}!` : 'ประกาศผลแล้ว รอบนี้ยังไม่ได้รางวัล') : 'ได้สิทธิ์ลุ้นรางวัลแล้ว') : `ส่งแล้ว ได้รับ ${s.rewardPerResponse} Coin`}</p>
          <p className="text-muted-foreground">{draw && !s.drawnAt ? 'ระบบจะสุ่มผู้ได้รางวัลตอนปิดแบบสอบถาม และแจ้งเตือนถ้าคุณได้รางวัล' : 'ขอบคุณที่ช่วยงานวิจัยของเพื่อนชาว มช.'}</p>
        </div>
      </Card>
    );
  }
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="font-extrabold">ตอบแบบสอบถาม</h3>
        <p className="text-sm text-muted-foreground">{s.questionCount} ข้อ · ส่ง Google Form แล้ว{draw ? 'ได้สิทธิ์ลุ้นรางวัล' : ` รับ ${s.rewardPerResponse} Coin`}อัตโนมัติ ไม่ต้องกรอกรหัสยืนยัน</p>
      </div>
      <Button type="button" className="w-full" variant={start ? 'outline' : 'primary'} onClick={open}><ExternalLink />{start ? 'เปิดแบบสอบถามอีกครั้ง' : 'เปิดแบบสอบถาม'}</Button>
      {start?.code && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-lavender-soft p-3">
          <div>
            <p className="text-xs text-muted-foreground">รหัส TEMBO ของคุณ (ใส่ในฟอร์มให้แล้ว อย่าแก้)</p>
            <p className="font-mono text-lg font-extrabold tracking-widest">{start.code}</p>
          </div>
          <CopyButton text={start.code} />
        </div>
      )}
      {waiting && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Hourglass className="size-4 shrink-0 text-primary" />
          {start?.submittedAt ? 'ได้รับการส่งแล้ว กำลังตรวจ…' : 'ส่งฟอร์มแล้วรอสักครู่ หน้านี้จะอัปเดตเอง (ครั้งแรกอาจใช้เวลาถึง 1 นาที)'}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}
