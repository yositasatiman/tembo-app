'use client';
import { FormEvent, Suspense, use, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Coins, QrCode } from 'lucide-react';
import type { CheckInResponse, EventDetail } from '@tembo/shared';
import { api, post } from '@/lib/api';
import { AppShell, useMe } from '@/components/shell';
import { Button, ErrorText, inputCls, Spinner } from '@/components/ui';

export default function CheckInPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <AppShell><Suspense fallback={<Spinner />}><CheckIn id={id} /></Suspense></AppShell>;
}

/**
 * ผู้เข้าร่วมสแกน QR ของผู้จัดด้วยกล้องมือถือ → เปิดหน้านี้พร้อมรหัส → เช็กอินอัตโนมัติ
 * หรือพิมพ์รหัส 6 ตัวที่ผู้จัดแสดงไว้
 */
function CheckIn({ id }: { id: string }) {
  const { reload } = useMe();
  const params = useSearchParams();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [code, setCode] = useState((params.get('code') ?? '').toUpperCase());
  const [result, setResult] = useState<CheckInResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const auto = useRef(false);

  async function submit(c: string) {
    setBusy(true); setError('');
    try { setResult(await post<CheckInResponse>(`/events/${id}/checkin`, { code: c })); reload(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    api<EventDetail>(`/events/${id}`).then((e) => {
      setEvent(e);
      // มาจากการสแกน QR → เช็กอินทันที (ครั้งเดียว)
      const fromQr = params.get('code');
      if (fromQr && !e.myCheckedIn && !auto.current) { auto.current = true; submit(fromQr.toUpperCase()); }
    }).catch((e) => setError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!event) return error ? <div className="mx-auto max-w-md"><ErrorText>{error}</ErrorText></div> : <Spinner />;
  const done = result ?? (event.myCheckedIn ? { reward: event.myReward, note: null } : null);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded-2xl bg-card p-6 text-center shadow-card">
        {done ? (
          <>
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-success-soft text-success"><CheckCircle2 className="size-8" /></span>
            <h1 className="mt-3 text-[22px] font-extrabold">เช็กอินแล้ว!</h1>
            <p className="mt-1 text-sm text-muted-foreground">{event.title}</p>
            {done.reward > 0 && (
              <p className="mx-auto mt-4 flex w-fit items-center gap-2 rounded-full bg-coin-soft px-4 py-2 text-lg font-extrabold"><Coins className="size-5 text-warning" />+{done.reward} Coin</p>
            )}
            {done.note && <p className="mt-3 rounded-xl bg-coin-soft px-3 py-2 text-xs text-warning-foreground">{done.note}{done.note.includes('cmu') && <> — <Link href="/me#cmu" className="font-bold underline">ยืนยันอีเมล</Link></>}</p>}
            <Link href={`/events/${id}`} className="mt-5 inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-white">กลับไปที่ Event</Link>
          </>
        ) : (
          <>
            <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-lavender text-primary"><QrCode className="size-8" /></span>
            <h1 className="mt-3 text-[22px] font-extrabold">เช็กอินเข้างาน</h1>
            <p className="mt-1 text-sm text-muted-foreground">{event.title}</p>
            <p className="mt-3 text-xs text-muted-foreground">สแกน QR ที่ผู้จัดแสดงด้วยกล้องมือถือ หรือพิมพ์รหัส 6 ตัวด้านล่าง (รหัสเปลี่ยนทุก 1 นาที)</p>
            <form className="mt-4 space-y-3" onSubmit={(e: FormEvent) => { e.preventDefault(); submit(code); }}>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
                aria-label="รหัสเช็กอิน" placeholder="ABC234" inputMode="text" autoComplete="off" autoCapitalize="characters"
                className={`${inputCls} text-center font-mono text-2xl tracking-[0.4em]`} />
              <ErrorText>{error}</ErrorText>
              <Button className="w-full" disabled={busy || code.length !== 6}>{busy ? 'กำลังเช็กอิน…' : 'เช็กอิน'}</Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
