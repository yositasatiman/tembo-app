'use client';
import { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import { DEFAULT_LANG, type Lang, LANG_COOKIE, pick } from '@tembo/shared';

interface LangCtx { lang: Lang; setLang: (l: Lang) => void }
const Ctx = createContext<LangCtx>({ lang: DEFAULT_LANG, setLang: () => undefined });

/** ภาษาเริ่มจาก cookie ที่ layout อ่านฝั่งเซิร์ฟเวอร์ (ไม่กระพริบตอนโหลด) */
export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, set] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    // API อ่าน cookie เดียวกันเพื่อเลือกภาษาของข้อความ error/แจ้งเตือน
    document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    set(l);
    // โหลดหน้าใหม่ เพื่อให้ข้อความที่มาจากเซิร์ฟเวอร์ (แจ้งเตือน, เหตุผลในฟีด ฯลฯ) เปลี่ยนภาษาด้วย ไม่มีภาษาปน
    window.location.reload();
  }, []);
  return <Ctx.Provider value={useMemo(() => ({ lang, setLang }), [lang, setLang])}>{children}</Ctx.Provider>;
}

/**
 * const { t, p, lang } = useT();
 * t('Save draft', 'บันทึกร่าง') — ข้อความคู่ในหน้าเว็บ
 * p(label) — เลือกภาษาจากข้อความ bi() ใน @tembo/shared
 */
export function useT() {
  const { lang, setLang } = useContext(Ctx);
  const t = useCallback((en: string, th: string) => (lang === 'th' ? th : en), [lang]);
  const p = useCallback((s: string) => pick(s, lang), [lang]);
  return { t, p, lang, setLang };
}
export type TFn = ReturnType<typeof useT>['t'];

/** ภาษาปัจจุบันนอก React (อ่านจาก cookie) */
export function clientLang(): Lang {
  if (typeof document === 'undefined') return DEFAULT_LANG;
  return /(?:^|;\s*)tembo_lang=th/.test(document.cookie) ? 'th' : 'en';
}

/** คำว่า Coin ตามภาษา: อังกฤษ "Coin" / ไทย "เหรียญ" — ใช้ในข้อความ JSX ที่ไม่ได้อยู่ใน t() */
export function CoinWord() {
  const { t } = useT();
  return <>{t('Coin', 'เหรียญ')}</>;
}
