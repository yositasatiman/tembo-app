'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getMe } from '@/lib/api';
import { Logo } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function Home() {
  const router = useRouter();
  const { t } = useT();
  useEffect(() => {
    getMe()
      .then((me) => router.replace(me.onboarded ? '/feed' : '/onboarding'))
      .catch(() => router.replace('/login'));
  }, [router]);
  return <div className="flex min-h-screen flex-col items-center justify-center gap-3"><Logo size="lg" /><p className="text-sm text-muted-foreground">{t('Loading…', 'กำลังโหลด…')}</p></div>;
}
