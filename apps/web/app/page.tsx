'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getMe } from '@/lib/api';
import { Logo } from '@/components/ui';

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    getMe()
      .then((me) => router.replace(me.onboarded ? '/surveys' : '/onboarding'))
      .catch(() => router.replace('/login'));
  }, [router]);
  return <div className="pt-32"><Logo /><p className="mt-2 text-center text-slate-500">กำลังโหลด…</p></div>;
}
