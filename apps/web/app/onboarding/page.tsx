'use client';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FACULTIES, facultyLabel, INTERESTS, interestLabel, type MeResponse } from '@tembo/shared';
import { getMe, patch } from '@/lib/api';
import { Button, Card, cx, ErrorText, Input, Logo } from '@/components/ui';
import { Req, Select } from '@/components/form';
import { LanguageSwitch } from '@/components/shell';
import { useT } from '@/lib/i18n';

export default function OnboardingPage() {
  const router = useRouter();
  const { t, p } = useT();
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
      <div className="flex items-center justify-between gap-3"><Logo size="lg" /><div className="w-56"><LanguageSwitch compact /></div></div>
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <h2 className="text-xl font-extrabold">{t('Set up your profile', 'ตั้งค่าโปรไฟล์')}</h2>
          <p className="text-sm text-muted-foreground">{t('We use this to match you with surveys and events. We only keep what we need.', 'ใช้จับคู่แบบสอบถามและกิจกรรมที่ตรงกับคุณ — เราเก็บเฉพาะข้อมูลที่จำเป็น')}</p>
        </div>
        <Input label={t('Display name *', 'ชื่อที่แสดง *')} required maxLength={50} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        <div>
          <span className="mb-1.5 block text-sm font-medium">{t('Faculty', 'คณะ')}<Req /></span>
          <Select label={t('Faculty', 'คณะ')} placeholder={t('Choose your faculty', 'เลือกคณะ')} value={faculty || null}
            options={FACULTIES.map((f) => ({ value: f, label: p(facultyLabel(f)) }))} onChange={setFaculty} />
        </div>
        <div>
          <span className="mb-1.5 block text-sm font-medium">{t('Year of study', 'ชั้นปี')}<Req /></span>
          <Select label={t('Year of study', 'ชั้นปี')} placeholder={t('Choose', 'เลือก')} value={studyYear} onChange={setStudyYear}
            options={[...[1, 2, 3, 4, 5, 6].map((y) => ({ value: y, label: t(`Year ${y}`, `ปี ${y}`) })), { value: 7, label: t('Graduate', 'บัณฑิตศึกษา') }]} />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">{t('Interests (choose any)', 'ความสนใจ (เลือกได้หลายข้อ)')}<Req /></legend>
          <div className="flex flex-wrap gap-2">
            {INTERESTS.map((i) => {
              const on = interests.includes(i);
              return (
                <button type="button" key={i} onClick={() => toggle(i)} aria-pressed={on}
                  className={cx('rounded-full border px-3 py-1.5 text-sm transition', on ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:border-primary hover:text-primary')}>
                  {on ? '✓ ' : ''}{p(interestLabel(i))}
                </button>
              );
            })}
          </div>
        </fieldset>
        <ErrorText>{error}</ErrorText>
        <Button className="w-full" disabled={loading || !faculty || interests.length === 0}>{loading ? t('Saving…', 'กำลังบันทึก…') : t('Save and get started', 'บันทึกและเริ่มใช้งาน')}</Button>
      </form>
    </Card>
    </div>
  );
}
