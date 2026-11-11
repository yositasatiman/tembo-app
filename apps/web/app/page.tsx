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
  return <div className="flex min-h-screen flex-col items-center justify-center gap-3"><Logo size="lg" /><p className="text-sm text-muted-foreground">กำลังโหลด…</p></div>;
}
