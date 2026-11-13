/* eslint-disable @next/next/no-img-element */
import { CalendarDays } from 'lucide-react';
import { EVENT_CATEGORY_LABEL, type EventSummary } from '@tembo/shared';
import { cx } from '../ui';
import { CATEGORY_GRADIENT } from './util';

/** รูปปกของ Event (ลิงก์รูปจากผู้จัด) — ถ้าไม่มีใช้พื้นไล่สีตามประเภท */
export function EventCover({ e, className = '', children }: { e: Pick<EventSummary, 'coverUrl' | 'category' | 'title'>; className?: string; children?: React.ReactNode }) {
  return (
    <div className={cx('relative w-full overflow-hidden bg-gradient-to-br', CATEGORY_GRADIENT[e.category], className)}>
      {e.coverUrl
        ? <img src={e.coverUrl} alt="" className="absolute inset-0 size-full object-cover" referrerPolicy="no-referrer" />
        : (
          <div aria-hidden className="absolute inset-0 flex items-center justify-end gap-2 pr-4 text-white/25">
            <span className="text-xs font-extrabold tracking-widest uppercase">{EVENT_CATEGORY_LABEL[e.category]}</span>
            <CalendarDays className="size-10" />
          </div>
        )}
      {children && <div className="relative flex h-full flex-col justify-between p-3">{children}</div>}
    </div>
  );
}
