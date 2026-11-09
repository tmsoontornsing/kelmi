import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ElementRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useT } from '../i18n';
import type { EmailSignUpResult } from '../lib/api';
import { animateLayout, haptic, PressableScale, reduceMotion, Reveal } from '../motion';
import { fonts, radius, useTheme } from '../theme';
import { AppText } from './AppText';
import { TextButton } from './Buttons';

type Mode = 'signup' | 'signin';

const MIN_LENGTH = 8;
const looksLikeEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());

// 0 to 4: length, mixed case, a digit, and a symbol or real length.
function strength(pw: string) {
  const checks = [
    pw.length >= MIN_LENGTH,
    /[a-z]/.test(pw) && /[A-Z]/.test(pw),
    /\d/.test(pw),
    /[^A-Za-z0-9]/.test(pw) || pw.length >= 12,
  ];
  return checks.filter(Boolean).length;
}

// Email and password sign-up or sign-in. onSubmit resolves when the person is signed in or told to confirm their email,
// and throws a readable message otherwise.
export function EmailAuthForm({
  onSubmit,
  onBack,
}: {
  onSubmit: (mode: Mode, email: string, password: string) => Promise<EmailSignUpResult>;
  onBack: () => void;
}) {
  const c = useTheme();
  const { t } = useT();
  const strengthLabel = [t('Too short'), t('Weak'), t('Okay'), t('Good'), t('Strong')];
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [focus, setFocus] = useState<'email' | 'password' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const passwordRef = useRef<ElementRef<typeof TextInput>>(null);

  // Segmented control: a pill that springs between the two labels.
  const [segWidth, setSegWidth] = useState(0);
  const pill = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const toValue = mode === 'signup' ? 0 : 1;
    if (reduceMotion()) pill.setValue(toValue);
    else Animated.spring(pill, { toValue, useNativeDriver: true, damping: 20, stiffness: 240, mass: 0.8 }).start();
  }, [mode, pill]);

  // Strength bar: each segment fills as the password earns it.
  const score = strength(password);
  const fills = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  useEffect(() => {
    fills.forEach((v, i) => {
      const toValue = mode === 'signup' && i < score ? 1 : 0;
      if (reduceMotion()) v.setValue(toValue);
      else Animated.timing(v, { toValue, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    });
  }, [score, mode, fills]);

  // A short side-to-side shake when something is wrong.
  const shake = useRef(new Animated.Value(0)).current;
  const shakeNow = () => {
    haptic.error();
    if (reduceMotion()) return;
    Animated.sequence(
      [9, -9, 6, -6, 3, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 55, useNativeDriver: true })),
    ).start();
  };

  const fail = (message: string) => {
    animateLayout();
    setError(message);
    shakeNow();
  };

  const submit = async () => {
    if (busy) return;
    if (!looksLikeEmail(email)) return fail(t('Enter the email you want to use.'));
    if (mode === 'signup' && password.length < MIN_LENGTH) return fail(t('Use at least {n} characters for the password.', { n: MIN_LENGTH }));
    if (mode === 'signin' && !password) return fail(t('Enter your password.'));
    setBusy(true);
    setError(null);
    try {
      const result = await onSubmit(mode, email, password);
      if (result === 'confirm') {
        haptic.success();
        animateLayout();
        setSentTo(email.trim());
      }
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    haptic.select();
    animateLayout();
    setMode(next);
    setError(null);
  };

  if (sentTo) return <CheckInbox email={sentTo} onBack={() => setSentTo(null)} />;

  const border = (field: 'email' | 'password') => (focus === field ? c.primary : c.control);

  return (
    <Reveal lift={10} style={styles.form}>
      <Animated.View style={[styles.form, { transform: [{ translateX: shake }] }]}>
        <View
          accessibilityRole="tablist"
          style={[styles.segment, { backgroundColor: c.tint }]}
          onLayout={(e) => setSegWidth(e.nativeEvent.layout.width)}
        >
          {segWidth > 0 ? (
            <Animated.View
              style={[
                styles.pill,
                {
                  width: (segWidth - 8) / 2,
                  backgroundColor: c.card,
                  transform: [{ translateX: pill.interpolate({ inputRange: [0, 1], outputRange: [0, (segWidth - 8) / 2] }) }],
                },
              ]}
            />
          ) : null}
          {(['signup', 'signin'] as Mode[]).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              onPress={() => switchMode(m)}
              style={styles.segmentItem}
            >
              <AppText weight="600" color={mode === m ? c.text : c.muted}>
                {m === 'signup' ? t('Create account') : t('Sign in')}
              </AppText>
            </Pressable>
          ))}
        </View>

        <TextInput
          accessibilityLabel={t('Email')}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          returnKeyType="next"
          placeholder={t('Email')}
          placeholderTextColor={c.muted}
          value={email}
          onChangeText={setEmail}
          onFocus={() => setFocus('email')}
          onBlur={() => setFocus(null)}
          onSubmitEditing={() => passwordRef.current?.focus()}
          style={[styles.input, { backgroundColor: c.card, color: c.text, borderColor: border('email') }]}
        />

        <View>
          <TextInput
            ref={passwordRef}
            accessibilityLabel={t('Password')}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            secureTextEntry={!show}
            returnKeyType="go"
            placeholder={t('Password')}
            placeholderTextColor={c.muted}
            value={password}
            onChangeText={setPassword}
            onFocus={() => setFocus('password')}
            onBlur={() => setFocus(null)}
            onSubmitEditing={submit}
            style={[styles.input, styles.password, { backgroundColor: c.card, color: c.text, borderColor: border('password') }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={show ? t('Hide password') : t('Show password')}
            hitSlop={8}
            onPress={() => {
              haptic.select();
              setShow((s) => !s);
            }}
            style={styles.eye}
          >
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={22} color={c.muted} />
          </Pressable>
        </View>

        {mode === 'signup' && password.length > 0 ? (
          <Reveal lift={0} style={styles.meterRow}>
            <View style={styles.meter}>
              {fills.map((v, i) => (
                <View key={i} style={[styles.seg, { backgroundColor: c.line }]}>
                  <Animated.View
                    style={[
                      styles.segFill,
                      {
                        backgroundColor: score <= 1 ? c.warn : c.primary,
                        width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
                      },
                    ]}
                  />
                </View>
              ))}
            </View>
            <AppText variant="footnote" style={styles.meterLabel}>{strengthLabel[score]}</AppText>
          </Reveal>
        ) : null}

        {error ? (
          <AppText variant="subhead" color={c.warn} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}

        <PressableScale
          accessibilityRole="button"
          accessibilityState={{ disabled: busy, busy }}
          to={0.97}
          onPress={submit}
          style={[styles.submit, { backgroundColor: c.primary, opacity: busy ? 0.75 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color={c.onPrimary} />
          ) : (
            <AppText style={{ fontFamily: fonts.displaySemi, fontSize: 17 }} color={c.onPrimary}>
              {mode === 'signup' ? t('Create account') : t('Sign in')}
            </AppText>
          )}
        </PressableScale>

        <View style={styles.center}>
          <TextButton label={t('Use Apple or Google instead')} onPress={onBack} />
        </View>
      </Animated.View>
    </Reveal>
  );
}

// Shown when the project asks for the address to be confirmed before the first sign-in.
function CheckInbox({ email, onBack }: { email: string; onBack: () => void }) {
  const c = useTheme();
  const { t } = useT();
  const pop = useRef(new Animated.Value(reduceMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 11, stiffness: 180, mass: 0.8 }).start();
  }, [pop]);

  return (
    <Reveal lift={10} style={styles.inbox}>
      <Animated.View
        style={[styles.badge, { backgroundColor: c.tint, transform: [{ scale: pop }], opacity: pop }]}
      >
        <Ionicons name="mail-open-outline" size={30} color={c.primaryText} />
      </Animated.View>
      <AppText variant="headline" accessibilityRole="header">{t('Check your email')}</AppText>
      <AppText variant="subhead" style={styles.centerText}>
        {t('We sent a link to {email}. Tap it on this phone to finish creating your account, then sign in here.', { email })}
      </AppText>
      <TextButton label={t('Use a different email')} onPress={onBack} />
    </Reveal>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  segment: { flexDirection: 'row', padding: 4, borderRadius: radius.control },
  segmentItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  pill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: radius.control - 3,
    shadowColor: '#13241A',
    shadowOpacity: 0.1,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  input: { minHeight: 48, borderWidth: 1.5, borderRadius: radius.control, paddingHorizontal: 14, fontSize: 17, fontFamily: fonts.regular },
  password: { paddingRight: 48 },
  eye: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  meter: { flex: 1, flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  segFill: { height: 4, borderRadius: 2 },
  meterLabel: { width: 62, textAlign: 'right' },
  submit: { minHeight: 52, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center' },
  inbox: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
});
