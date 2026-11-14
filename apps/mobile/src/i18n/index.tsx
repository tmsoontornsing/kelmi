import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import contentEs from './locales/content/es.json';
import contentFr from './locales/content/fr.json';
import contentHi from './locales/content/hi.json';
import contentJa from './locales/content/ja.json';
import contentPt from './locales/content/pt.json';
import contentTh from './locales/content/th.json';
import contentZh from './locales/content/zh.json';
import uiEs from './locales/ui/es.json';
import uiFr from './locales/ui/fr.json';
import uiHi from './locales/ui/hi.json';
import uiJa from './locales/ui/ja.json';
import uiPt from './locales/ui/pt.json';
import uiTh from './locales/ui/th.json';
import uiZh from './locales/ui/zh.json';

// Kelmi's own translator. English text is the key: write `t('Save Your Plan')` and each language file maps that
// sentence to its translation. Anything missing falls back to the English, so a new string never shows up blank.
//
// Two kinds of text are translated:
// - `t` and `tn` for text written in the code. `node scripts/i18n.mjs` finds every literal passed to them.
// - `tx` and `line` for food data: recipe titles and steps, ingredient names, aisles and units from the catalog,
//   and the example data in data/mock.ts. They are looked up when shown, so the week switches language at once.

export const LANGUAGES = [
  { code: 'en', native: 'English', english: 'English', locale: 'en-US' },
  { code: 'es', native: 'Español', english: 'Spanish', locale: 'es' },
  { code: 'zh', native: '简体中文', english: 'Chinese (Simplified)', locale: 'zh-Hans' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', locale: 'hi-IN' },
  { code: 'fr', native: 'Français', english: 'French', locale: 'fr' },
  { code: 'pt', native: 'Português', english: 'Portuguese', locale: 'pt-BR' },
  { code: 'th', native: 'ไทย', english: 'Thai', locale: 'th-TH' },
  { code: 'ja', native: '日本語', english: 'Japanese', locale: 'ja-JP' },
] as const;

export type Language = (typeof LANGUAGES)[number]['code'];
// What the person picked in Settings. 'system' follows the phone's language.
export type LanguageChoice = Language | 'system';

type Dict = Record<string, string>;
const UI: Record<Language, Dict> = { en: {}, es: uiEs, zh: uiZh, hi: uiHi, fr: uiFr, pt: uiPt, th: uiTh, ja: uiJa };
const CONTENT: Record<Language, Dict> = { en: {}, es: contentEs, zh: contentZh, hi: contentHi, fr: contentFr, pt: contentPt, th: contentTh, ja: contentJa };

// Outfit only covers Latin letters. Thai, Hindi, Chinese and Japanese draw in the system font, which has their scripts in
// every weight, and Thai and Hindi get taller lines so marks above and below the letters are not clipped.
export const LATIN: Record<Language, boolean> = { en: true, es: true, fr: true, pt: true, zh: false, hi: false, th: false, ja: false };
export const TALL_SCRIPT: Record<Language, boolean> = { en: false, es: false, fr: false, pt: false, zh: false, hi: true, th: true, ja: false };

const STORAGE_KEY = 'kavi.language';

// The phone's language, when Kelmi has it; English otherwise.
export function systemLanguage(): Language {
  let tag = 'en';
  try {
    tag = Intl.DateTimeFormat().resolvedOptions().locale ?? 'en';
  } catch {}
  const code = tag.toLowerCase().split(/[-_]/)[0];
  return LANGUAGES.find((l) => l.code === code)?.code ?? 'en';
}

const fill = (text: string, vars?: Record<string, string | number>) =>
  vars ? text.replace(/\{(\w+)\}/g, (all, name: string) => (name in vars ? String(vars[name]) : all)) : text;

export type Translator = ReturnType<typeof translator>;

function translator(lang: Language) {
  const ui = UI[lang];
  const content = CONTENT[lang];
  let folded: Dict | null = null;
  const locale = LANGUAGES.find((l) => l.code === lang)!.locale;

  // Text written in the code. `vars` fills {name} placeholders after translating.
  const t = (key: string, vars?: Record<string, string | number>) => fill(ui[key] ?? key, vars);
  // A count with a singular and a plural sentence. Both are keys; `{n}` is the count.
  const tn = (n: number, one: string, other: string, vars?: Record<string, string | number>) =>
    t(n === 1 ? one : other, { n, ...vars });

  // Food data. People type pantry items in any case, so a second lookup ignores case.
  const tx = (text: string) => {
    if (lang === 'en' || !text) return text;
    const exact = content[text];
    if (exact) return exact;
    folded ??= Object.fromEntries(Object.entries(content).map(([k, v]) => [k.toLowerCase(), v]));
    return folded[text.trim().toLowerCase()] ?? text;
  };

  // An ingredient or grocery line, "Chicken breast, 1.5 lb": the name, then an amount and unit, each translated.
  const line = (text: string) => {
    if (lang === 'en') return text;
    const comma = text.lastIndexOf(', ');
    if (comma < 0) return tx(text);
    const amount = text.slice(comma + 2);
    const m = amount.match(/^([\d.,/½¼¾⅓⅔⅛⅜⅝⅞]+)\s*(.*)$/);
    const shown = m ? (m[2] ? `${m[1]} ${tx(m[2])}` : m[1]) : tx(amount);
    return `${tx(text.slice(0, comma))}, ${shown}`;
  };

  // Cooking time, written "25 min" or "5 min prep" in the data.
  const minutes = (text: string) => {
    const m = text.match(/^(\d+) min( prep)?$/);
    if (!m) return tx(text);
    return m[2] ? t('{n} min prep', { n: m[1] }) : t('{n} min', { n: m[1] });
  };

  // A label such as a meal name placed inside a sentence. English keeps title case in its buttons ("Swap Dinner");
  // other languages write the word in lower case there ("Cambiar cena").
  const midSentence = (label: string) => (lang === 'en' ? label : label.toLocaleLowerCase(locale));

  const date = (d: Date, options: Intl.DateTimeFormatOptions) => d.toLocaleDateString(locale, options);

  return { lang, locale, t, tn, tx, line, minutes, midSentence, date };
}

const translators = new Map<Language, Translator>();
const get = (lang: Language) => {
  let tr = translators.get(lang);
  if (!tr) translators.set(lang, (tr = translator(lang)));
  return tr;
};

// For code outside React (error messages in lib/api.ts). Always the language currently on screen.
let current: Language = systemLanguage();
export const t: Translator['t'] = (key, vars) => get(current).t(key, vars);
export const tx: Translator['tx'] = (text) => get(current).tx(text);
export const line: Translator['line'] = (text) => get(current).line(text);
export const currentLanguage = () => current;
// The separator for a list of names: Chinese and Japanese use an enumeration comma, the rest a comma and a space.
export const comma = () => (current === 'zh' || current === 'ja' ? '、' : ', ');

type Ctx = { choice: LanguageChoice; lang: Language; setChoice: (c: LanguageChoice) => void };
const LanguageContext = createContext<Ctx>({ choice: 'system', lang: current, setChoice: () => {} });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<LanguageChoice>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved && (saved === 'system' || LANGUAGES.some((l) => l.code === saved))) setChoiceState(saved as LanguageChoice);
      })
      .catch(() => {});
  }, []);

  const lang = choice === 'system' ? systemLanguage() : choice;
  current = lang;

  const value = useMemo<Ctx>(
    () => ({
      choice,
      lang,
      setChoice: (c) => {
        setChoiceState(c);
        AsyncStorage.setItem(STORAGE_KEY, c).catch(() => {});
      },
    }),
    [choice, lang],
  );
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

// `const { t, tn, tx, line, minutes } = useT();` in any component. It re-renders when the language changes.
export function useT(): Translator {
  return get(useContext(LanguageContext).lang);
}

export const useLanguage = () => useContext(LanguageContext);
