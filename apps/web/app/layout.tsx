import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TEMBO — มอลูป',
  description: 'ศูนย์รวมแบบสอบถามงานวิจัยและกิจกรรมสำหรับชาว มช.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>
        <main className="mx-auto min-h-screen max-w-md px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
