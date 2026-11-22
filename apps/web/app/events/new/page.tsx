'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Coins } from 'lucide-react';
import {
  EVENT_CATEGORIES, EVENT_CATEGORY_LABEL, EVENT_RULES, INTERESTS, interestLabel, quoteEvent,
  type EventCategory, type EventDetail,
} from '@tembo/shared';
import { post } from '@/lib/api';
import { AppShell, useMe } from '@/components/shell';
import { Button, Card, Chip, cx, ErrorText, Field, inputCls } from '@/components/ui';
import { EventCover } from '@/components/event/cover';
import { useT } from '@/lib/i18n';

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const at = (days: number, hour: number) => { const d = new Date(Date.now() + days * 86_400_000); d.setHours(hour, 0, 0, 0); return d; };

export default function NewEventPage() {
  return <AppShell><NewEvent /></AppShell>;
}

function NewEvent() {
  const router = useRouter();
  const { me } = useMe();
  const { t, p } = useT();
  const [title, setTitle] = useState('');
  const [hostName, setHostName] = useState('');
  const [category, setCategory] = useState<EventCategory>('CLUB');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [startsAt, setStartsAt] = useState(() => toLocalInput(at(7, 17)));
  const [endsAt, setEndsAt] = useState(() => toLocalInput(at(7, 20)));
  const [limited, setLimited] = useState(true);
  const [capacity, setCapacity] = useState(50);
  const [tags, setTags] = useState<string[]>([]);
  const [coverUrl, setCoverUrl] = useState('');
  const [registrationUrl, setRegistrationUrl] = useState('');
  const [withReward, setWithReward] = useState(false);
  const [reward, setReward] = useState(5);
  const [slots, setSlots] = useState(20);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const q = quoteEvent({ rewardPerCheckIn: withReward ? reward : 0, rewardSlots: withReward ? slots : 0 });
  const short = q.total > me.balance;

  function toggleTag(t: string) {
    setTags((cur) => cur.includes(t) ? cur.filter((x) => x !== t) : cur.length >= EVENT_RULES.MAX_TAGS ? cur : [...cur, t]);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const ev = await post<EventDetail>('/events', {
        title, hostName, category, description, location, tags,
        startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString(),
        capacity: limited ? capacity : null,
        coverUrl: coverUrl.trim(), registrationUrl: registrationUrl.trim(),
        rewardPerCheckIn: withReward ? reward : 0, rewardSlots: withReward ? slots : 0,
      });
      router.replace(`/events/${ev.id}`);
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  }

  const coverPreview = /^https:\/\/\S+$/.test(coverUrl.trim()) ? coverUrl.trim() : null;

  return (
    <form onSubmit={submit} className="mx-auto max-w-2xl space-y-3">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">{t('Create event', 'สร้างกิจกรรม')}</h1>
        <p className="text-xs text-muted-foreground">{t(`Your event goes live after an admin reviews it · posting fee ${EVENT_RULES.POST_FEE} Coin (refunded if not approved)`, `กิจกรรมจะขึ้นฟีดหลังแอดมินตรวจ · ค่าโพสต์ ${EVENT_RULES.POST_FEE} เหรียญ (คืนให้ถ้าไม่ผ่านการตรวจ)`)}</p>
      </div>

      <Card className="space-y-4">
        <Field label={t('Event name', 'ชื่อกิจกรรม')}><input className={inputCls} required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('e.g. Campus Night Market', 'เช่น ตลาดนัดกลางคืนในมหาวิทยาลัย')} /></Field>
        <Field label={t('Organizer', 'ผู้จัด')} hint={t('Club, faculty or unit running the event', 'ชื่อชมรม คณะ หรือหน่วยงานที่จัด')}>
          <input className={inputCls} required minLength={2} maxLength={80} value={hostName} onChange={(e) => setHostName(e.target.value)} placeholder={t('e.g. CMU Student Union', 'เช่น สโมสรนักศึกษา มช.')} />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium">{t('Type', 'ประเภท')}</span>
          <div className="flex gap-2" role="tablist">{EVENT_CATEGORIES.map((c) => <Chip key={c} onCard active={category === c} onClick={() => setCategory(c)}>{p(EVENT_CATEGORY_LABEL[c])}</Chip>)}</div>
        </div>
        <Field label={t('Details', 'รายละเอียด')}>
          <textarea className={inputCls} rows={4} required minLength={10} maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('What happens, who can join, what to bring', 'ทำอะไรในงาน ใครเข้าร่วมได้ ต้องเตรียมอะไรมา')} />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium">{t('Tags', 'แท็ก')} <span className="font-normal text-muted-foreground">{t(`(up to ${EVENT_RULES.MAX_TAGS}, used to match people's interests)`, `(ไม่เกิน ${EVENT_RULES.MAX_TAGS} — ใช้จับคู่กับความสนใจของผู้ใช้)`)}</span></span>
          <div className="flex flex-wrap gap-1.5">
            {INTERESTS.map((x) => (
              <button key={x} type="button" onClick={() => toggleTag(x)} aria-pressed={tags.includes(x)}
                className={cx('rounded-full px-3 py-1.5 text-xs font-bold', tags.includes(x) ? 'bg-primary text-white' : 'bg-lavender-soft text-primary')}>{p(interestLabel(x))}</button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <Field label={t('Location', 'สถานที่')}><input className={inputCls} required minLength={2} maxLength={200} value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t('e.g. Ang Kaew, Chiang Mai University', 'เช่น ลานอ่างแก้ว มหาวิทยาลัยเชียงใหม่')} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('Starts', 'เริ่ม')}><input type="datetime-local" className={inputCls} required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></Field>
          <Field label={t('Ends', 'จบ')}><input type="datetime-local" className={inputCls} required value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></Field>
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={limited} onChange={(e) => setLimited(e.target.checked)} className="size-4 accent-primary" />{t('Limit the number of attendees', 'จำกัดจำนวนผู้เข้าร่วม')}</label>
          {limited && (
            <Field label={t('Spots', 'รับได้ (คน)')} hint={t('When full, people can join a waitlist and move up automatically if someone cancels', 'เต็มแล้วผู้ใช้เข้าคิวรอได้ ถ้ามีคนยกเลิกระบบจะเลื่อนคิวให้อัตโนมัติ')}>
              <input type="number" className={inputCls} min={1} max={EVENT_RULES.MAX_CAPACITY} required value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} />
            </Field>
          )}
        </div>
        <Field label={t('Registration form link (optional)', 'ลิงก์ฟอร์มลงทะเบียนของผู้จัด (ไม่บังคับ)')} hint={t('e.g. a Google Form. People register in TEMBO, then fill in this form.', 'เช่น Google Form — ผู้ใช้ลงทะเบียนใน TEMBO แล้วกรอกฟอร์มนี้ต่อ')}>
          <input type="url" className={inputCls} value={registrationUrl} onChange={(e) => setRegistrationUrl(e.target.value)} placeholder="https://forms.gle/…" />
        </Field>
        <Field label={t('Cover image link (optional)', 'ลิงก์รูปปก (ไม่บังคับ)')} hint={t('An image link starting with https://', 'ลิงก์รูปภาพที่ขึ้นต้นด้วย https://')}>
          <input type="url" className={inputCls} value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} placeholder="https://…/cover.jpg" />
        </Field>
        <EventCover e={{ coverUrl: coverPreview, category, title }} className="h-[82px] rounded-xl" />
      </Card>

      <Card className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={withReward} onChange={(e) => setWithReward(e.target.checked)} className="size-4 accent-primary" />{t('Give Coin to people who check in', 'ให้เหรียญกับคนที่เช็กอินที่งาน')}</label>
        {withReward && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('Coin per person', 'เหรียญต่อคน')}><input type="number" className={inputCls} min={1} max={EVENT_RULES.MAX_REWARD} required value={reward} onChange={(e) => setReward(Number(e.target.value))} /></Field>
            <Field label={t('Number of people rewarded', 'จำนวนคนที่ได้รางวัล')} hint={limited ? t(`Up to ${capacity}`, `ไม่เกิน ${capacity} คน`) : undefined}>
              <input type="number" className={inputCls} min={1} max={limited ? capacity : EVENT_RULES.MAX_REWARD_SLOTS} required value={slots} onChange={(e) => setSlots(Number(e.target.value))} />
            </Field>
          </div>
        )}
        <div className="space-y-1 rounded-xl bg-lavender-soft p-3 text-sm">
          <Row label={t('Posting fee', 'ค่าโพสต์')} value={q.postFee} />
          {withReward && <Row label={t(`Reward Coin (${reward} × ${slots}), held until paid out`, `เหรียญรางวัล (${reward} × ${slots} คน) — พักไว้จนกว่าจะจ่าย`)} value={q.rewardPool} />}
          <div className="flex justify-between border-t border-primary/15 pt-1 font-extrabold"><span>{t('Total', 'รวมที่ต้องใช้')}</span><span className="flex items-center gap-1"><Coins className="size-4 text-warning" />{q.total.toLocaleString()}</span></div>
          <p className="text-xs text-muted-foreground">{t(`Your Coin ${me.balance.toLocaleString()} · unpaid rewards are returned after the event`, `เหรียญของคุณ ${me.balance.toLocaleString()} · รางวัลที่ไม่ได้จ่ายจะคืนให้เมื่อจบงาน`)}</p>
        </div>
      </Card>

      <ErrorText>{short ? t(`Not enough Coin (need ${q.total}, you have ${me.balance})`, `เหรียญไม่พอ (ต้องใช้ ${q.total} มีอยู่ ${me.balance})`) : error}</ErrorText>
      <Button className="w-full" disabled={loading || short}>{loading ? t('Submitting…', 'กำลังส่ง…') : t('Submit for review', 'ส่งให้แอดมินตรวจ')}</Button>
    </form>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span>{value.toLocaleString()}</span></div>;
}
