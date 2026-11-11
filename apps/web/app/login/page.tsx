'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MeResponse } from '@tembo/shared';
import { post } from '@/lib/api';
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
    <div className="space-y-6 pt-12">
      <div>
        <Logo />
        <p className="mt-1 text-center text-slate-500">แบบสอบถามงานวิจัยและกิจกรรมของชาว มช. ในที่เดียว</p>
      </div>
      <Card>
        {step === 'email' ? (
          <form onSubmit={requestCode} className="space-y-4">
            <h2 className="text-lg font-bold">เข้าสู่ระบบ / สมัครสมาชิก</h2>
            <Input label="อีเมล" type="email" required autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            <Input label="โค้ดชวนเพื่อน (ถ้ามี)" value={referralCode} maxLength={6}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())} placeholder="เช่น AB12CD" />
            <ErrorText>{error}</ErrorText>
            <Button disabled={loading || !email}>{loading ? 'กำลังส่ง…' : 'ส่งรหัส OTP ไปที่อีเมล'}</Button>
            <p className="text-center text-xs text-slate-500">สมัครครั้งแรกรับ 100 Coin</p>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <h2 className="text-lg font-bold">ใส่รหัส 6 หลัก</h2>
            <p className="text-sm text-slate-600">ส่งไปที่ <b>{email}</b> แล้ว (ใช้ได้ 10 นาที)</p>
            <Input label="รหัส OTP" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" />
            <ErrorText>{error}</ErrorText>
            <Button disabled={loading || code.length !== 6}>{loading ? 'กำลังตรวจสอบ…' : 'ยืนยัน'}</Button>
            <div className="flex justify-between text-sm">
              <button type="button" className="text-slate-500 underline" onClick={() => { setStep('email'); setCode(''); setError(''); }}>เปลี่ยนอีเมล</button>
              <button type="button" className="text-brand-600 underline" onClick={() => requestCode()} disabled={loading}>ส่งรหัสอีกครั้ง</button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
