import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { asLang, LANG_COOKIE } from '@tembo/shared';
import { LangProvider } from '@/lib/i18n';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const th = asLang((await cookies()).get(LANG_COOKIE)?.value) === 'th';
  return th
    ? { title: 'TEMBO — แบบสอบถามงานวิจัยและกิจกรรมของชาว มช.', description: 'ศูนย์รวมแบบสอบถามงานวิจัยและกิจกรรมสำหรับชาว มช. ด้วยระบบเหรียญหมุนเวียน' }
    : { title: 'TEMBO — Research surveys and events for CMU', description: 'Find research surveys and campus events at Chiang Mai University, powered by Coin rewards.' };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = asLang((await cookies()).get(LANG_COOKIE)?.value);
  return (
    <html lang={lang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body><LangProvider initial={lang}>{children}</LangProvider></body>
    </html>
  );
}
