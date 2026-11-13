import Link from 'next/link';
import { CalendarDays, Coins, Link2, ListChecks, Sparkles, Users } from 'lucide-react';
import type { SurveySummary } from '@tembo/shared';
import { Badge, buttonCls, fmtDay, Progress, StatusBadge } from '../ui';

export function SurveyCard({ s, myFaculty, mine: mineTab }: { s: SurveySummary; myFaculty?: string | null; mine?: boolean }) {
  const mine = mineTab || s.isMine;
  const pct = s.quota ? Math.round((s.responsesCount / s.quota) * 100) : 0;
  const sameFaculty = !!myFaculty && s.ownerFaculty === myFaculty;
  return (
    <article className="tembo-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {mine ? <><StatusBadge status={s.status} /><Badge tone="outline">ของคุณ</Badge></> : sameFaculty && <Badge><Sparkles />คณะเดียวกับคุณ</Badge>}
            {s.mode === 'EXTERNAL' && <Badge tone="muted"><Link2 />ฟอร์มภายนอก</Badge>}
          </div>
          <h3 className="font-display text-base leading-snug font-semibold">
            <Link href={`/surveys/${s.id}`} className="hover:text-primary">{s.title}</Link>
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">{s.ownerName ?? 'ไม่ระบุชื่อ'}{s.ownerFaculty && ` · คณะ${s.ownerFaculty}`}</p>
        </div>
        <Badge tone="solid"><Coins />{s.rewardPerResponse} Coin / คน</Badge>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">ตอบแล้ว {s.responsesCount}/{s.quota} คน</span>
          <span className="text-muted-foreground">{pct}%</span>
        </div>
        <Progress value={pct} />
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground [&_svg]:size-3.5">
          <span className="flex items-center gap-1.5"><CalendarDays />ปิด {fmtDay(s.closesAt)}</span>
          <span className="flex items-center gap-1.5"><ListChecks />{s.questionCount} ข้อ</span>
          <span className="flex items-center gap-1.5"><Users />รับได้อีก {s.payableResponses} คน</span>
        </div>
        <Link href={`/surveys/${s.id}`} className={buttonCls('primary', 'sm')}>{mine ? 'ดูรายละเอียด' : 'ทำแบบสอบถาม'}</Link>
      </div>
    </article>
  );
}
