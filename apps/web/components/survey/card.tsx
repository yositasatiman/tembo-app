'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Bookmark, Clock, Link2, Share2, Sparkles, Users } from 'lucide-react';
import { api, post } from '@/lib/api';
import type { SurveySummary } from '@tembo/shared';
import { cx, fmtDate } from '../ui';
import { shareLink } from '../event/util';

const STATUS: Record<string, [string, string]> = {
  OPEN: ['เปิดรับ', 'bg-lavender-soft text-primary'],
  PENDING_REVIEW: ['รอแอดมินตรวจ', 'bg-coin-soft text-warning-foreground'],
  CLOSED: ['ปิดแล้ว', 'bg-muted text-muted-foreground'],
};

/** การ์ดแบบสอบถาม ตาม Figma "SURVEY / discovery" */
export function SurveyCard({ s, reason, onToast }: { s: SurveySummary; reason?: string; onToast?: (m: string) => void }) {
  const href = `/surveys/${s.id}`;
  const [saved, setSaved] = useState(s.saved);
  async function toggleSave() {
    const next = !saved;
    setSaved(next);
    try {
      if (next) await post(`/surveys/${s.id}/save`); else await api(`/surveys/${s.id}/save`, { method: 'DELETE' });
      onToast?.(next ? 'บันทึกแล้ว' : 'เลิกบันทึกแล้ว');
    } catch (e) { setSaved(!next); onToast?.((e as Error).message); }
  }
  const full = s.status === 'OPEN' && s.payableResponses === 0;
  const [label, cls] = full ? ['รอเติม Coin', 'bg-coin-soft text-warning-foreground'] : STATUS[s.status] ?? [s.status, 'bg-muted'];
  return (
    <article className="space-y-2 rounded-2xl bg-card p-3.5 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-wide text-primary">
          แบบสอบถาม{s.mode === 'EXTERNAL' && <span className="flex items-center gap-0.5 font-bold text-muted-foreground"><Link2 className="size-3" />ฟอร์มภายนอก</span>}
        </span>
        <span className={cx('rounded-full px-2.5 py-1 text-[11px] font-extrabold', cls)}>{s.isMine ? `${label} · ของคุณ` : label}</span>
      </div>
      {reason && <p className="flex items-center gap-1 text-[11px] font-bold text-success"><Sparkles className="size-3.5" />{reason}</p>}
      <h3 className="text-lg leading-snug font-extrabold"><Link href={href} className="hover:text-primary">{s.title}</Link></h3>
      {s.description && <p className="line-clamp-2 text-[13px] text-muted-foreground">{s.description}</p>}
      <div className="flex flex-wrap gap-1.5 pt-0.5 text-xs">
        <span className="rounded-xl bg-coin-soft px-2.5 py-1.5 font-extrabold">+ {s.rewardPerResponse} Coin</span>
        <span className="flex items-center gap-1 rounded-xl bg-lavender-soft px-2.5 py-1.5 text-muted-foreground"><Clock className="size-3.5" />{s.questionCount} ข้อ</span>
        <span className="flex items-center gap-1 rounded-xl bg-lavender-soft px-2.5 py-1.5 text-muted-foreground"><Users className="size-3.5" />เหลือ {s.payableResponses} ที่</span>
      </div>
      <p className="text-xs text-muted-foreground">ปิดรับ {fmtDate(s.closesAt)}{s.isMine && ` · ตอบแล้ว ${s.responsesCount}/${s.quota}`}</p>
      <div className="flex items-center justify-between">
        <div className="flex">
        <button type="button" aria-label={saved ? 'เลิกบันทึก' : 'บันทึก'} aria-pressed={saved} onClick={toggleSave}
          className="flex size-9 items-center justify-center rounded-xl text-indigo hover:bg-lavender-soft"><Bookmark className={cx('size-[18px]', saved && 'fill-primary text-primary')} /></button>
        <button type="button" aria-label="แชร์" onClick={async () => { const m = await shareLink(s.title, href); if (m) onToast?.(m); }}
          className="flex size-9 items-center justify-center rounded-xl text-indigo hover:bg-lavender-soft"><Share2 className="size-[18px]" /></button>
        </div>
        <Link href={href} className={cx('flex h-10 items-center rounded-full px-4 text-sm font-bold',
          s.responded ? 'bg-success-soft text-success' : 'bg-indigo text-white hover:bg-indigo/90')}>
          {s.isMine ? 'ดูรายละเอียด' : s.responded ? 'ตอบแล้ว' : 'ทำแบบสอบถาม'}
        </Link>
      </div>
    </article>
  );
}
