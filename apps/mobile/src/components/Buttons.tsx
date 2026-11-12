import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, useColorScheme, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { useT } from '../i18n';
import { haptic, PressableScale, reduceMotion } from '../motion';
import { fonts, radius, useTheme } from '../theme';
import { AppText } from './AppText';

type IconName = ComponentProps<typeof Ionicons>['name'];

const pressed = (p: boolean): ViewStyle => ({ opacity: p ? 0.7 : 1 });

// feedback: the haptic on press. Use 'success' when the press completes a task, 'none' to stay silent.
// loading: shows a spinner beside the label, breathes the button, and ignores presses until the work is done.
export function PrimaryButton({
  label,
  onPress,
  style,
  feedback = 'tap',
  loading = false,
  icon,
  pressScale = 0.97,
}: {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  feedback?: 'tap' | 'success' | 'none';
  loading?: boolean;
  // A trailing icon that nudges forward while the button is held and springs back, for buttons that move you on.
  icon?: IconName;
  pressScale?: number;
}) {
  const c = useTheme();
  const nudge = useRef(new Animated.Value(0)).current;
  const moveIcon = (to: number) => {
    if (!reduceMotion()) Animated.spring(nudge, { toValue: to, useNativeDriver: true, speed: 30, bounciness: 12 }).start();
  };
  const breathe = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!loading || reduceMotion()) {
      breathe.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 0.7, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [loading, breathe]);
  return (
    <Animated.View style={{ opacity: breathe }}>
      <PressableScale
        accessibilityRole="button"
        accessibilityState={{ busy: loading }}
        to={pressScale}
        onPressIn={() => moveIcon(8)}
        onPressOut={() => moveIcon(0)}
        onPress={() => {
          if (loading) return;
          if (feedback !== 'none') haptic[feedback]();
          onPress();
        }}
        style={({ pressed: p }) => [styles.primary, (loading || icon) && styles.loading, { backgroundColor: c.primary }, pressed(p), style]}
      >
        {loading ? <ActivityIndicator color={c.onPrimary} /> : null}
        <AppText style={{ fontFamily: fonts.displaySemi, fontSize: 17 }} color={c.onPrimary}>
          {label}
        </AppText>
        {icon && !loading ? (
          <Animated.View style={{ transform: [{ translateX: nudge }] }}>
            <Ionicons name={icon} size={20} color={c.onPrimary} />
          </Animated.View>
        ) : null}
      </PressableScale>
    </Animated.View>
  );
}

// Apple's button stays black on light and white on dark; Google's stays a plain outlined button.
// Google's brand rules call for the four-color G on a white (light) or #131314 (dark) button, so it is drawn here
// instead of using a one-color icon.
const GOOGLE_G =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

export function ProviderButton({
  provider,
  onPress,
  disabled,
}: {
  provider: 'apple' | 'google';
  onPress: () => void;
  disabled?: boolean;
}) {
  const c = useTheme();
  const { t } = useT();
  const apple = provider === 'apple';
  const dark = useColorScheme() === 'dark';
  const bg = apple ? (dark ? '#FFFFFF' : '#000000') : dark ? '#131314' : '#FFFFFF';
  const fg = apple ? (dark ? '#000000' : '#FFFFFF') : dark ? '#E3E3E3' : '#1F1F1F';
  const border = apple ? bg : dark ? '#8E918F' : '#747775';
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      to={0.97}
      onPress={() => {
        if (disabled) return;
        haptic.tap();
        onPress();
      }}
      style={({ pressed: p }) => [
        styles.primary,
        styles.provider,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : p ? 0.7 : 1 },
      ]}
    >
      {apple ? <Ionicons name="logo-apple" size={20} color={fg} /> : <SvgXml xml={GOOGLE_G} width={20} height={20} />}
      <AppText style={{ fontFamily: fonts.displaySemi, fontSize: 17 }} color={fg}>
        {apple ? t('Continue with Apple') : t('Continue with Google')}
      </AppText>
    </PressableScale>
  );
}

export function TextButton({
  label,
  onPress,
  color,
  bold = true,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  bold?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={4}
      style={({ pressed: p }) => [styles.text, pressed(p)]}
    >
      <AppText weight={bold ? '600' : '400'} color={color ?? c.primaryText}>
        {label}
      </AppText>
    </Pressable>
  );
}

// Square 44pt icon button with a tinted background. Always needs a screen reader label.
export function IconButton({
  icon,
  label,
  onPress,
  tone = 'tint',
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  tone?: 'tint' | 'card';
}) {
  const c = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      to={0.9}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed: p }) => [
        styles.icon,
        { backgroundColor: tone === 'tint' ? c.tint : c.card },
        pressed(p),
      ]}
    >
      <Ionicons name={icon} size={20} color={tone === 'tint' ? c.primaryText : c.text} />
    </PressableScale>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  return <View style={[{ backgroundColor: c.card, borderRadius: radius.card }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  provider: { flexDirection: 'row', gap: 10, borderWidth: 1.5 },
  primary: {
    minHeight: 52,
    borderRadius: radius.pill,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loading: { flexDirection: 'row', gap: 10 },
  text: { minHeight: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 44, height: 44, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
});
