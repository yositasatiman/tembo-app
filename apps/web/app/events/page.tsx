'use client';
import { CalendarDays } from 'lucide-react';
import { AppShell } from '@/components/shell';
import { Card, SectionHeader } from '@/components/ui';

export default function EventsPage() {
  return (
    <AppShell>
      <SectionHeader title="Event ในมหาวิทยาลัย" subtitle="งานคณะ กิจกรรมชมรม และเวิร์กช็อปรอบ มช." />
      <Card className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-accent text-accent-foreground"><CalendarDays className="size-7" /></span>
        <p className="font-display text-lg font-semibold">เร็ว ๆ นี้</p>
        <p className="max-w-sm text-sm text-muted-foreground">สมัครเข้าร่วม Event ด้วย Coin และเช็กอินด้วย QR จะมาในขั้นที่ 4</p>
      </Card>
    </AppShell>
  );
}
