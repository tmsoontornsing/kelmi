import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, useColorScheme, View, type StyleProp, type ViewStyle } from 'react-native';

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
  const bg = apple ? (dark ? '#FFFFFF' : '#000000') : c.card;
  const fg = apple ? (dark ? '#000000' : '#FFFFFF') : c.text;
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
        { backgroundColor: bg, borderColor: apple ? bg : c.control, opacity: disabled ? 0.5 : p ? 0.7 : 1 },
      ]}
    >
      <Ionicons name={apple ? 'logo-apple' : 'logo-google'} size={20} color={fg} />
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
