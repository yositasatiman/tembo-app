'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MeResponse } from '@tembo/shared';
import { post } from '@/lib/api';
import { ClipboardList, Coins, ShieldCheck } from 'lucide-react';
import { Button, Card, ErrorText, Input, Logo } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function requestCode(e?: FormEvent) {
    e?.preventDefault();
    setError(''); setLoading(true);
    try {
      await post('/auth/otp/request', { email });
      setStep('code');
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  async function verify(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await post<{ isNew: boolean; me: MeResponse }>('/auth/otp/verify', {
        email, code, referralCode: referralCode.trim() || undefined,
      });
      router.replace(res.me.onboarded ? '/surveys' : '/onboarding');
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -top-24 -right-20 size-96 rounded-full bg-primary-foreground/10" />
        <div aria-hidden className="absolute -bottom-32 left-10 size-72 rounded-full bg-primary-foreground/5" />
        <span className="relative font-display text-2xl font-semibold">TEMBO</span>
        <div className="relative space-y-6">
          <h1 className="font-display text-4xl leading-tight font-semibold">แบบสอบถามงานวิจัยและกิจกรรม<br />ของชาว มช. ในที่เดียว</h1>
          <ul className="space-y-3 text-sm opacity-90 [&_svg]:size-5">
            <li className="flex items-center gap-3"><ClipboardList />ตอบแบบสอบถามงานวิจัย รับ Coin ทันที</li>
            <li className="flex items-center gap-3"><Coins />ใช้ Coin โพสต์แบบสอบถามของตัวเอง หาคนตอบได้เร็วขึ้น</li>
            <li className="flex items-center gap-3"><ShieldCheck />รางวัลถูกล็อกไว้ใน Escrow ก่อนเปิดรับ จ่ายจริงทุกครั้ง</li>
          </ul>
        </div>
        <p className="relative text-xs opacity-70">Coin ใช้ภายในแพลตฟอร์มเท่านั้น ไม่ใช่เงินจริง</p>
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center gap-2 text-center">
            <Logo size="lg" />
            <p className="text-sm text-muted-foreground lg:hidden">แบบสอบถามงานวิจัยและกิจกรรมของชาว มช. ในที่เดียว</p>
          </div>
      <Card className="p-6">
        {step === 'email' ? (
          <form onSubmit={requestCode} className="space-y-4">
            <h2 className="font-display text-lg font-semibold">เข้าสู่ระบบ / สมัครสมาชิก</h2>
            <Input label="อีเมล" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <Input label="โค้ดชวนเพื่อน (ถ้ามี)" value={referralCode} maxLength={6}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())} placeholder="เช่น AB12CD" />
            <ErrorText>{error}</ErrorText>
            <Button className="w-full" disabled={loading || !email}>{loading ? 'กำลังส่ง…' : 'ส่งรหัส OTP ไปที่อีเมล'}</Button>
            <p className="text-center text-xs text-muted-foreground">สมัครครั้งแรกรับ 100 Coin</p>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <h2 className="font-display text-lg font-semibold">ใส่รหัส 6 หลัก</h2>
            <p className="text-sm text-muted-foreground">ส่งไปที่ <b>{email}</b> แล้ว (ใช้ได้ 10 นาที)</p>
            <Input label="รหัส OTP" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
            <ErrorText>{error}</ErrorText>
            <Button className="w-full" disabled={loading || code.length !== 6}>{loading ? 'กำลังตรวจสอบ…' : 'ยืนยัน'}</Button>
            <div className="flex justify-between text-sm">
              <button type="button" className="text-muted-foreground underline" onClick={() => { setStep('email'); setCode(''); setError(''); }}>เปลี่ยนอีเมล</button>
              <button type="button" className="text-primary underline" onClick={() => requestCode()} disabled={loading}>ส่งรหัสอีกครั้ง</button>
            </div>
          </form>
        )}
      </Card>
        </div>
      </div>
    </div>
  );
}
