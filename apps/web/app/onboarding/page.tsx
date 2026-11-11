'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FACULTIES, INTERESTS, type MeResponse } from '@tembo/shared';
import { getMe, patch } from '@/lib/api';
import { Button, Card, ErrorText, Input } from '@/components/ui';

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
      router.replace('/me');
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <h2 className="text-xl font-bold">ตั้งค่าโปรไฟล์</h2>
          <p className="text-sm text-slate-500">ใช้จับคู่แบบสอบถามและกิจกรรมที่ตรงกับคุณ — เราเก็บเฉพาะข้อมูลที่จำเป็น</p>
        </div>
        <Input label="ชื่อที่แสดง" required maxLength={50} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">คณะ</span>
          <select required value={faculty} onChange={(e) => setFaculty(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3">
            <option value="" disabled>เลือกคณะ</option>
            {FACULTIES.map((f) => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-slate-700">ชั้นปี</span>
          <select value={studyYear} onChange={(e) => setStudyYear(Number(e.target.value))}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3">
            {[1, 2, 3, 4, 5, 6].map((y) => <option key={y} value={y}>ปี {y}</option>)}
            <option value={7}>บัณฑิตศึกษา</option>
          </select>
        </label>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-700">ความสนใจ (เลือกได้หลายข้อ)</legend>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => {
              const on = interests.includes(i);
              return (
                <button type="button" key={i} onClick={() => toggle(i)} aria-pressed={on}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${on ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-brand-500'}`}>
                  {on ? '✓ ' : ''}{i}
                </button>
              );
            })}
          </div>
        </fieldset>
        <ErrorText>{error}</ErrorText>
        <Button disabled={loading || !faculty || interests.length === 0}>{loading ? 'กำลังบันทึก…' : 'บันทึกและเริ่มใช้งาน'}</Button>
      </form>
    </Card>
  );
}
