'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FACULTIES, INTERESTS, type MeResponse } from '@tembo/shared';
import { getMe, patch } from '@/lib/api';
import { Button, Card, cx, ErrorText, Input, inputCls, Logo } from '@/components/ui';

export default function OnboardingPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [faculty, setFaculty] = useState('');
  const [studyYear, setStudyYear] = useState(1);
  const [interests, setInterests] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getMe().then((me) => {
      setDisplayName(me.displayName ?? '');
      setFaculty(me.faculty ?? '');
      setStudyYear(me.studyYear ?? 1);
      setInterests(me.interests);
    }).catch(() => router.replace('/login'));
  }, [router]);

  const toggle = (i: string) => setInterests((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await patch<MeResponse>('/me/profile', { displayName, faculty, studyYear, interests });
      router.replace('/feed');
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <div className="flex justify-center"><Logo size="lg" /></div>
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <h2 className="text-xl font-extrabold">ตั้งค่าโปรไฟล์</h2>
          <p className="text-sm text-muted-foreground">ใช้จับคู่แบบสอบถามและกิจกรรมที่ตรงกับคุณ — เราเก็บเฉพาะข้อมูลที่จำเป็น</p>
        </div>
        <Input label="ชื่อที่แสดง" required maxLength={50} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">คณะ</span>
          <select required value={faculty} onChange={(e) => setFaculty(e.target.value)}
            className={inputCls}>
            <option value="" disabled>เลือกคณะ</option>
            {FACULTIES.map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">ชั้นปี</span>
          <select value={studyYear} onChange={(e) => setStudyYear(Number(e.target.value))}
            className={inputCls}>
            {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>ปี {y}</option>)}
            <option value={7}>บัณฑิตศึกษา</option>
          </select>
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">ความสนใจ (เลือกได้หลายข้อ)</legend>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => {
              const on = interests.includes(i);
              return (
                <button type="button" key={i} onClick={() => toggle(i)} aria-pressed={on}
                  className={cx('rounded-full border px-3 py-1.5 text-sm transition', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary hover:text-primary')}>
                  {on ? '✓ ' : ''}{i}
                </button>
              );
            })}
          </div>
        </fieldset>
        <ErrorText>{error}</ErrorText>
        <Button className="w-full" disabled={loading || !faculty || interests.length === 0}>{loading ? 'กำลังบันทึก…' : 'บันทึกและเริ่มใช้งาน'}</Button>
      </form>
    </Card>
    </div>
  );
}
