import { Children, type ReactNode } from 'react';
import { Platform, StyleSheet, Text, type TextProps, type TextStyle } from 'react-native';

import { LATIN, TALL_SCRIPT, useLanguage } from '../i18n';
import { fonts, useTheme } from '../theme';

type Variant = 'largeTitle' | 'title' | 'headline' | 'body' | 'subhead' | 'footnote' | 'eyebrow' | 'money';

type Props = TextProps & { variant?: Variant; color?: string; weight?: TextStyle['fontWeight'] };

// Custom fonts come as one file per weight, so a weight has to pick a family instead of setting fontWeight.
const familyFor = (w: TextStyle['fontWeight']) =>
  w === '700' || w === '800' || w === '900' || w === 'bold'
    ? fonts.display
    : w === '600'
      ? fonts.displaySemi
      : w === '500'
        ? fonts.medium
        : fonts.regular;

// Outfit sets its middle dot tight against the text, which looks cramped as a separator. Wherever a plain string uses
// " · " as one, a hair space either side of the dot gives it back its air.
const airy = (children: ReactNode): ReactNode =>
  Children.map(children, (child) => (typeof child === 'string' ? child.replace(/ · /g, ' \u2009·\u2009 ') : child));

// Weights for the system font, used for scripts Outfit does not have.
const systemWeight = (w: TextStyle['fontWeight'] | undefined, family: string | undefined): TextStyle['fontWeight'] =>
  w && w !== 'normal' ? w : family === fonts.display ? '700' : family === fonts.displaySemi ? '600' : family === fonts.medium ? '500' : '400';

// One place for the type scale, all in Outfit. Sizes follow iOS defaults (17 body, 15 subhead, 13 footnote).
// Pass `weight` (or fontWeight in style) for a different weight; a fontFamily in style wins over both.
export function AppText({ variant = 'body', color, weight, style, children, ...rest }: Props) {
  const c = useTheme();
  const { lang } = useLanguage();
  const base: Record<Variant, TextStyle> = {
    largeTitle: { fontFamily: fonts.display, fontSize: 30, letterSpacing: -0.6, lineHeight: 34, color: c.text },
    title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, color: c.text },
    headline: { fontFamily: fonts.displaySemi, fontSize: 17, lineHeight: 22, color: c.text },
    body: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 24, color: c.text },
    subhead: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 20, color: c.muted },
    footnote: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: c.muted },
    eyebrow: { fontFamily: fonts.displaySemi, fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase', color: c.muted },
    money: { fontFamily: fonts.displaySemi, fontSize: 18, color: c.text, fontVariant: ['tabular-nums'] },
  };
  const own = StyleSheet.flatten(style) ?? {};
  const w = weight ?? own.fontWeight;
  const fontFamily = own.fontFamily ?? (w ? familyFor(w) : base[variant].fontFamily);
  // Thai, Hindi and Chinese use the system font in the matching weight, with room for marks above and below.
  const lineHeight = own.lineHeight ?? base[variant].lineHeight;
  const script: TextStyle = LATIN[lang]
    ? { fontFamily, fontWeight: 'normal' }
    : {
        fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
        fontWeight: systemWeight(w, fontFamily),
        letterSpacing: 0,
        lineHeight: lineHeight && TALL_SCRIPT[lang] ? Math.round(lineHeight * 1.2) : lineHeight,
      };
  return (
    <Text
      style={[base[variant], color ? { color } : null, style, script]}
      {...rest}
    >
      {airy(children)}
    </Text>
  );
}
