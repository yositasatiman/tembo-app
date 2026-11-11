'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { SurveySummary } from '@tembo/shared';
import { api } from '@/lib/api';
import { Card, fmtDate, StatusBadge, TopBar } from '@/components/ui';

export default function SurveysPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'open' | 'mine'>('open');
  const [rows, setRows] = useState<SurveySummary[] | null>(null);

  useEffect(() => {
    setRows(null);
    api<SurveySummary[]>(tab === 'open' ? '/surveys' : '/surveys/mine').then(setRows).catch(() => router.replace('/login'));
  }, [tab, router]);

  return (
    <div className="space-y-4">
      <TopBar />
      <Link href="/surveys/new" className="block rounded-xl bg-brand-600 px-4 py-3 text-center font-semibold text-white hover:bg-brand-700">
        + โพสต์แบบสอบถามงานวิจัย
      </Link>
      <div className="flex rounded-xl bg-brand-50 p-1 text-sm font-semibold">
        {(['open', 'mine'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 ${tab === t ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>
            {t === 'open' ? 'เปิดรับอยู่' : 'ของฉัน'}
          </button>
        ))}
      </div>
      {rows === null ? <p className="text-center text-slate-500">กำลังโหลด…</p>
        : rows.length === 0 ? <Card className="text-center text-sm text-slate-500">{tab === 'open' ? 'ยังไม่มีแบบสอบถามที่เปิดรับ' : 'คุณยังไม่ได้โพสต์แบบสอบถาม'}</Card>
        : rows.map((s) => (
          <Link key={s.id} href={`/surveys/${s.id}`} className="block">
            <Card className="space-y-2 transition hover:ring-brand-500">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-bold leading-snug">{s.title}</h3>
                <span className="shrink-0 rounded-full bg-brand-600 px-2.5 py-0.5 text-sm font-bold text-white">+{s.rewardPerResponse}</span>
              </div>
              <p className="text-xs text-slate-500">{s.ownerName ?? 'ไม่ระบุชื่อ'} · {s.questionCount} ข้อ · ปิด {fmtDate(s.closesAt)}</p>
              <div className="flex items-center justify-between text-xs">
                <StatusBadge status={s.status} />
                <span className="text-slate-500">ตอบแล้ว {s.responsesCount}/{s.quota} · รับได้อีก {s.payableResponses} คน</span>
              </div>
            </Card>
          </Link>
        ))}
    </div>
  );
}
