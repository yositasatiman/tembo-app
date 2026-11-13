import type { EventCategory, EventDetail, EventSummary } from '@tembo/shared';

const TZ = 'Asia/Bangkok';
const day = (d: Date, opts: Intl.DateTimeFormatOptions) => d.toLocaleDateString('th-TH', { timeZone: TZ, ...opts });
const time = (d: Date) => d.toLocaleTimeString('th-TH', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
const sameDay = (a: Date, b: Date) => day(a, { dateStyle: 'short' }) === day(b, { dateStyle: 'short' });

/** "พฤ. 8 ต.ค. · 17:00–21:00" (การ์ด) */
export function eventTimeShort(startIso: string, endIso: string) {
  const s = new Date(startIso); const e = new Date(endIso);
  const d = day(s, { weekday: 'short', day: 'numeric', month: 'short' });
  return sameDay(s, e) ? `${d} · ${time(s)}–${time(e)}` : `${d} ${time(s)} – ${day(e, { day: 'numeric', month: 'short' })} ${time(e)}`;
}

/** "วันพฤหัสบดีที่ 8 ตุลาคม 2569 · 17:00–21:00 น." (หน้ารายละเอียด) */
export function eventTimeLong(startIso: string, endIso: string) {
  const s = new Date(startIso); const e = new Date(endIso);
  const d = day(s, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return sameDay(s, e) ? `${d} · ${time(s)}–${time(e)} น.` : `${d} ${time(s)} น. – ${day(e, { weekday: 'short', day: 'numeric', month: 'short' })} ${time(e)} น.`;
}

export const timeOnly = (iso: string) => time(new Date(iso));

/** อักษรย่อของผู้จัด เช่น "สโมสรนักศึกษา มช." → "สม" / "CMU Student Union" → "CSU" */
export function hostMark(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (/^[A-Za-z]/.test(name)) return words.map((w) => w[0]).slice(0, 3).join('').toUpperCase();
  // อักษรไทย: ข้ามสระหน้า (เ แ โ ใ ไ) แล้วเอาพยัญชนะตัวแรกของคำแรกและคำสุดท้าย
  const first = (w: string) => [...w].find((c) => /[ก-ฮA-Za-z0-9]/.test(c)) ?? '';
  return (words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0] ?? '?')) || '?';
}

export const CATEGORY_GRADIENT: Record<EventCategory, string> = {
  UNIVERSITY: 'from-[#6c3ce9] to-[#20105c]',
  FACULTY: 'from-[#8b5cf6] to-[#3b1d8f]',
  CLUB: 'from-[#c084fc] to-[#6c3ce9]',
};

/** สถานะที่ผู้ใช้เห็นบนการ์ด/หน้ารายละเอียด */
export function eventState(e: EventSummary) {
  if (e.status === 'CANCELLED') return 'cancelled' as const;
  if (e.status === 'ENDED' || new Date(e.endsAt) <= new Date()) return 'ended' as const;
  if (e.status === 'PENDING_REVIEW') return 'pending' as const;
  if (e.status === 'REJECTED') return 'rejected' as const;
  if (e.myStatus === 'REGISTERED') return 'registered' as const;
  if (e.myStatus === 'WAITLISTED') return 'waitlisted' as const;
  if (e.isFull) return 'full' as const;
  return 'open' as const;
}

/** ไฟล์ .ics สำหรับ "เพิ่มลงปฏิทิน" */
export function downloadIcs(e: EventDetail, url: string) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (m) => `\\${m}`);
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TEMBO//Events//TH', 'CALSCALE:GREGORIAN', 'BEGIN:VEVENT',
    `UID:${e.id}@tembo`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(e.startsAt)}`, `DTEND:${stamp(e.endsAt)}`,
    `SUMMARY:${esc(e.title)}`, `LOCATION:${esc(e.location)}`, `DESCRIPTION:${esc(`${e.hostName}\n${url}`)}`, `URL:${url}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  a.download = `tembo-event-${e.id}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** แชร์ลิงก์ (มือถือใช้ share sheet, คอมพิวเตอร์คัดลอกลิงก์) — คืนข้อความแจ้งผล */
export async function shareLink(title: string, path: string): Promise<string | null> {
  const url = `${window.location.origin}${path}`;
  if (navigator.share) {
    try { await navigator.share({ title, url }); return null; } catch { return null; }
  }
  try { await navigator.clipboard.writeText(url); return 'คัดลอกลิงก์แล้ว'; } catch { return url; }
}
