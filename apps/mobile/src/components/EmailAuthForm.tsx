import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ElementRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useT } from '../i18n';
import type { EmailSignUpResult, PersonName } from '../lib/api';
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
  onForgotPassword,
  initialMode = 'signup',
}: {
  onSubmit: (mode: Mode, email: string, password: string, name: PersonName) => Promise<EmailSignUpResult>;
  onBack: () => void;
  // Sends the reset email for the address typed in. Without it the "Forgot password?" link is not shown.
  onForgotPassword?: (email: string) => Promise<void>;
  initialMode?: Mode;
}) {
  const c = useTheme();
  const { t } = useT();
  const strengthLabel = [t('Too short'), t('Weak'), t('Okay'), t('Good'), t('Strong')];
  const [mode, setMode] = useState<Mode>(initialMode);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [focus, setFocus] = useState<'first' | 'last' | 'email' | 'password' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const lastRef = useRef<ElementRef<typeof TextInput>>(null);
  const emailRef = useRef<ElementRef<typeof TextInput>>(null);
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
    if (mode === 'signup' && (!firstName.trim() || !lastName.trim())) return fail(t('Enter your first and last name.'));
    if (!looksLikeEmail(email)) return fail(t('Enter the email you want to use.'));
    if (mode === 'signup' && password.length < MIN_LENGTH) return fail(t('Use at least {n} characters for the password.', { n: MIN_LENGTH }));
    if (mode === 'signin' && !password) return fail(t('Enter your password.'));
    setBusy(true);
    setError(null);
    try {
      const result = await onSubmit(mode, email, password, { first: firstName, last: lastName });
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

  const forgot = async () => {
    if (busy || !onForgotPassword) return;
    if (!looksLikeEmail(email)) return fail(t('Enter your email above, then tap Forgot password.'));
    setBusy(true);
    setError(null);
    try {
      await onForgotPassword(email);
      haptic.success();
      animateLayout();
      setResetSentTo(email.trim());
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
  if (resetSentTo) return <CheckInbox email={resetSentTo} reset onBack={() => setResetSentTo(null)} />;

  const border = (field: 'first' | 'last' | 'email' | 'password') => (focus === field ? c.primary : c.control);

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

        {mode === 'signup' ? (
          <View style={styles.nameRow}>
            <TextInput
              accessibilityLabel={t('First name')}
              autoCapitalize="words"
              autoComplete="given-name"
              autoCorrect={false}
              textContentType="givenName"
              returnKeyType="next"
              placeholder={t('First name')}
              placeholderTextColor={c.muted}
              value={firstName}
              onChangeText={setFirstName}
              onFocus={() => setFocus('first')}
              onBlur={() => setFocus(null)}
              onSubmitEditing={() => lastRef.current?.focus()}
              style={[styles.input, styles.half, { backgroundColor: c.card, color: c.text, borderColor: border('first') }]}
            />
            <TextInput
              ref={lastRef}
              accessibilityLabel={t('Last name')}
              autoCapitalize="words"
              autoComplete="family-name"
              autoCorrect={false}
              textContentType="familyName"
              returnKeyType="next"
              placeholder={t('Last name')}
              placeholderTextColor={c.muted}
              value={lastName}
              onChangeText={setLastName}
              onFocus={() => setFocus('last')}
              onBlur={() => setFocus(null)}
              onSubmitEditing={() => emailRef.current?.focus()}
              style={[styles.input, styles.half, { backgroundColor: c.card, color: c.text, borderColor: border('last') }]}
            />
          </View>
        ) : null}

        <View>
        <TextInput
          ref={emailRef}
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
          style={[styles.input, styles.withLead, { backgroundColor: c.card, color: c.text, borderColor: border('email') }]}
        />
        <View pointerEvents="none" style={styles.lead}>
          <Ionicons name="mail-outline" size={20} color={focus === 'email' ? c.primary : c.muted} />
        </View>
        </View>

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
            style={[styles.input, styles.password, styles.withLead, { backgroundColor: c.card, color: c.text, borderColor: border('password') }]}
          />
          <View pointerEvents="none" style={styles.lead}>
            <Ionicons name="lock-closed-outline" size={20} color={focus === 'password' ? c.primary : c.muted} />
          </View>
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

        {mode === 'signin' && onForgotPassword ? (
          <View style={styles.forgot}>
            <TextButton label={t('Forgot password?')} bold={false} onPress={forgot} />
          </View>
        ) : null}

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
function CheckInbox({ email, onBack, reset = false }: { email: string; onBack: () => void; reset?: boolean }) {
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
        {reset
          ? t('If there is an account for {email}, we sent a link to choose a new password. Tap it on this phone.', { email })
          : t('We sent a link to {email}. Tap it on this phone to finish creating your account, then sign in here.', { email })}
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
  nameRow: { flexDirection: 'row', gap: 10 },
  half: { flex: 1, minWidth: 0 },
  lead: { position: 'absolute', left: 14, top: 0, bottom: 0, justifyContent: 'center' },
  withLead: { paddingLeft: 44 },
  eye: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  meter: { flex: 1, flexDirection: 'row', gap: 4 },
  seg: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  segFill: { height: 4, borderRadius: 2 },
  meterLabel: { width: 62, textAlign: 'right' },
  submit: { minHeight: 52, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center' },
  forgot: { alignItems: 'flex-end', marginTop: -4 },
  inbox: { alignItems: 'center', gap: 8, paddingVertical: 8 },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
});
