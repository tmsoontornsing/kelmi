import { useColorScheme } from 'react-native';

// Color tokens from the Kelmi mockups. Every text pair here passes WCAG AA contrast.
const light = {
  bg: '#F7FAF5',
  card: '#FFFFFF',
  text: '#13241A',
  muted: '#5B6B61',
  primary: '#1F7A4D',
  onPrimary: '#FFFFFF',
  primaryText: '#1F7A4D',
  tint: '#EEF6F1',
  track: '#E3EDE6',
  line: '#E3EDE6',
  control: '#7C9486',
  warn: '#8A5A0B',
  warnBg: '#FFF4E0',
  danger: '#C0352B',
  switchOff: '#C9D3CD',
  appleBg: '#000000',
  appleText: '#FFFFFF',
  badge: '#A7D96B',
  badgeText: '#13241A',
};

export type Palette = typeof light;

const dark: Palette = {
  bg: '#0E1712',
  card: '#17231C',
  text: '#E6EFE9',
  muted: '#9FB2A6',
  primary: '#5CC99A',
  onPrimary: '#0E1712',
  primaryText: '#5CC99A',
  tint: '#1F3328',
  track: '#26362D',
  line: '#26362D',
  control: '#7F9B8B',
  warn: '#F2B65A',
  warnBg: '#33281A',
  danger: '#FF8A7E',
  switchOff: '#3A4A41',
  appleBg: '#FFFFFF',
  appleText: '#000000',
  badge: '#A7D96B',
  badgeText: '#13241A',
};

export function useTheme(): Palette {
  return useColorScheme() === 'dark' ? dark : light;
}

// Outfit is the one typeface for everything Kelmi draws: headings, numbers, buttons, labels, body text, and inputs.
// <AppText> picks the weight for you. Only the system's own pieces (alerts, the keyboard, share sheets) use the system font.
export const fonts = {
  display: 'Outfit_700Bold',
  displaySemi: 'Outfit_600SemiBold',
  medium: 'Outfit_500Medium',
  regular: 'Outfit_400Regular',
};

export const radius = { card: 16, row: 14, pill: 999, control: 12 };

export const space = { gutter: 20 };
