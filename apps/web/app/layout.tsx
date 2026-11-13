import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TEMBO — แบบสอบถามงานวิจัยและกิจกรรมของชาว มช.',
  description: 'ศูนย์รวมแบบสอบถามงานวิจัยและกิจกรรมสำหรับชาว มช. ด้วยระบบ Coin หมุนเวียน',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
