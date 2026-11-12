import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { IconButton, ProviderButton, TextButton } from '../components/Buttons';
import { EmailAuthForm } from '../components/EmailAuthForm';
import { Mascot } from '../components/Mascot';
import { HouseholdReceipt } from '../components/HouseholdReceipt';
import { BudgetPreview } from '../components/BudgetPreview';
import { dietAllowsMeat, DIETS, GOALS, MEAT_LEVELS } from '../data/mock';
import { comma, useT } from '../i18n';
import { markConsentPending } from '../lib/consent';
import { PLUS_ENABLED } from '../lib/flags';
import { animateLayout, haptic } from '../motion';
import { modalEdges, resetTo } from '../navigation';
import { useApp } from '../state/AppState';
import { space, useTheme } from '../theme';

// Below this many points of visible height (a page sheet on a short phone), Pip is left out and the card stretches to fill the screen.
const SHORT_VIEWPORT = 800;

// Sign up or sign in, as a sheet over Save Your Plan. Closing it leaves the plan answers where they are.
export default function Auth() {
  const c = useTheme();
  const app = useApp();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { t, tn, tx } = useT();
  // Came from "I Already Have an Account": a plain log-in page, with no plan to save and no household to show.
  const loginOnly = from === 'welcome';

  // When the week is already planned, show it as what would be lost. In onboarding, signing in comes before the first plan,
  // so that path shows the household answers instead.
  const dinners = app.plan.filter((m) => m.type === 'dinner' && m.status !== 'skip');
  const hasWeek = dinners.length > 0;
  const overBudget = app.planTotal > app.budget;
  const groceryItems = app.hasList ? app.groceries.reduce((n, aisle) => n + aisle.items.length, 0) : 0;
  const dietName = tx(DIETS.find((d) => d.id === app.diet)?.name ?? 'Everything');
  const goalName = tx(GOALS.find((g) => g.id === app.goal)?.name ?? 'Just eat well');
  // How much meat they like is only asked of diets that allow meat, so it is only shown for those.
  const meatName = dietAllowsMeat(app.diet) ? tx(MEAT_LEVELS.find((m) => m.id === app.meatLevel)?.name ?? 'Some') : null;
  // Meals actually in the plan (not skipped), so the count agrees with the cost beside it.
  const mealsPlanned = app.plan.filter((m) => m.status !== 'skip').length;

  // The choices the week was planned around, one short label each. Anything left empty is left out.
  const dislikes = app.dislikes.slice(0, 3).map(tx).join(comma()) + (app.dislikes.length > 3 ? ` +${app.dislikes.length - 3}` : '');
  const choiceChips = [
    tn(app.people, '{n} person', '{n} people'),
    goalName,
    dietName,
    ...(meatName ? [`${t('Meat')}: ${meatName}`] : []),
    ...(app.allergies.length ? [`${t('Avoiding')} ${app.allergies.map(tx).join(comma())}`] : []),
    ...(app.dislikes.length ? [`${t('Skipping')} ${dislikes}`] : []),
    ...(app.appliances.length ? [tn(app.appliances.length, '{n} appliance', '{n} appliances')] : []),
  ];

  // The answers about to be saved, set out as a receipt. The week itself is planned after sign-in, so none exists yet.
  const receiptRows: [string, string][] = [
    [t('People'), String(app.people)],
    [t('Goal'), goalName],
    [t('Diet'), dietName],
    ...(meatName ? [[t('Meat'), meatName] as [string, string]] : []),
    [t('Avoiding'), app.allergies.length ? app.allergies.map(tx).join(comma()) : t('Nothing')],
  ];

  // Someone already signed in has nothing to do here: if the sheet opens for them, it closes at once. Signing in from inside
  // the sheet doesn't count, since that path finishes on its own.
  const openedSignedIn = useRef<boolean | null>(null);
  useEffect(() => {
    if (!app.authReady) return;
    if (openedSignedIn.current === null) openedSignedIn.current = app.signedIn;
    if (openedSignedIn.current && app.signedIn) router.back();
  }, [app.authReady, app.signedIn]);

  const [emailOpen, setEmailOpen] = useState(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const shortScreen = viewportHeight > 0 && viewportHeight < SHORT_VIEWPORT;
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New accounts see the paywall once, over their first week; someone returning to an existing account goes straight in.
  // resetTo closes this sheet along with the rest of onboarding.
  const enter = () => {
    resetTo('/week');
    if (PLUS_ENABLED && from !== 'welcome') router.push('/paywall');
  };

  // Nothing is pre-ticked: the person agrees on purpose, and the time and version are saved with their account.
  const needAgreement = () => {
    if (agreed) return false;
    haptic.error();
    setError(t('Agree to the Terms of Service and Privacy Policy to continue.'));
    return true;
  };

  const withProvider = async (provider: 'apple' | 'google') => {
    if (needAgreement()) return;
    await markConsentPending();
    setBusy(true);
    setError(null);
    try {
      if (await app.signInWithProvider(provider)) enter();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const withEmail = async (mode: 'signup' | 'signin', email: string, password: string) => {
    if (!agreed) throw new Error(t('Agree to the Terms of Service and Privacy Policy to continue.'));
    await markConsentPending();
    if (mode === 'signin') {
      await app.signInWithEmail(email, password);
      enter();
      return 'signed-in' as const;
    }
    const result = await app.signUpWithEmail(email, password);
    if (result === 'signed-in') enter();
    return result;
  };

  const toggleEmail = (open: boolean) => {
    animateLayout();
    setError(null);
    setEmailOpen(open);
  };

  const agreeRow = (
    <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            accessibilityLabel={t('I agree to the {terms} and {privacy}.').replace('{terms}', t('Terms of Service')).replace('{privacy}', t('Privacy Policy'))}
            onPress={() => {
              haptic.select();
              setError(null);
              setAgreed((a) => !a);
            }}
            hitSlop={6}
            style={styles.agree}
          >
            <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={26} color={agreed ? c.primary : c.muted} />
            <AppText variant="footnote" style={styles.agreeText}>
              {/* One sentence with the two links as placeholders, so each language can put them where its grammar needs. */}
              {t('I agree to the {terms} and {privacy}.')
                .split(/(\{terms\}|\{privacy\})/)
                .map((part, i) =>
                  part === '{terms}' ? (
                    <AppText key={i} variant="footnote" weight="600" color={c.primaryText} style={styles.link} accessibilityRole="link" onPress={() => router.push('/legal/terms')}>
                      {t('Terms of Service')}
                    </AppText>
                  ) : part === '{privacy}' ? (
                    <AppText key={i} variant="footnote" weight="600" color={c.primaryText} style={styles.link} accessibilityRole="link" onPress={() => router.push('/legal/privacy')}>
                      {t('Privacy Policy')}
                    </AppText>
                  ) : (
                    part
                  ),
                )}
            </AppText>
    </Pressable>
  );

  return (
    <SafeAreaView edges={modalEdges} style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.top}>
        <IconButton icon="close" label={t('Close, sign in later')} onPress={() => router.back()} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)} contentContainerStyle={[styles.content, emailOpen ? null : styles.spread]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {loginOnly ? (
            <View style={styles.helloRow}>
              <View style={styles.helloCopy}>
                <AppText variant="eyebrow" color={c.primaryText}>
                  {t('Welcome back')}
                </AppText>
                <AppText variant="largeTitle" accessibilityRole="header">
                  {t('Log In')}
                </AppText>
                <AppText color={c.muted}>{t('Log in to pick up your plan and grocery list where you left off.')}</AppText>
              </View>
            </View>
          ) : (
          <View style={styles.copy}>
            <AppText variant="eyebrow" color={c.primaryText}>
              {t('Last step')}
            </AppText>
            <AppText variant="largeTitle" accessibilityRole="header">
              {hasWeek ? (overBudget ? t('Your week is over budget') : t('Your week fits your budget')) : t('Save Your Plan')}
            </AppText>
            {emailOpen ? null : (
              <AppText color={c.muted}>
                {hasWeek
                  ? t('You built it. Sign in and it\'s saved, with your grocery list.')
                  : t('You set these up. Sign in and they are kept, ready on any phone you use.')}
              </AppText>
            )}
          </View>
          )}
          {loginOnly ? (
            emailOpen ? null : (
              <View style={[styles.waiting, { backgroundColor: c.card, borderColor: c.line }]}>
                <View style={styles.waitPip}>
                  <Mascot pose="wave" size={110} decorative />
                </View>
                <AppText variant="eyebrow" color={c.muted}>
                  {t('Waiting for you')}
                </AppText>
                {(
                  [
                    ['calendar-outline', t('Your weekly meal plan')],
                    ['cart-outline', t('Your grocery list and cart')],
                    ['options-outline', t('Your household and food preferences')],
                  ] as const
                ).map(([icon, label]) => (
                  <View key={label} style={styles.waitRow}>
                    <View style={[styles.waitIcon, { backgroundColor: c.bg }]}>
                      <Ionicons name={icon} size={20} color={c.primaryText} />
                    </View>
                    <AppText weight="500" style={styles.flex}>
                      {label}
                    </AppText>
                  </View>
                ))}
              </View>
            )
          ) : hasWeek ? (
            <BudgetPreview
              total={app.planTotal}
              budget={app.budget}
              people={app.people}
              chips={choiceChips}
              meals={mealsPlanned}
              items={groceryItems}
              compact={emailOpen}
              showPip={!shortScreen && !emailOpen}
              fill={shortScreen && !emailOpen}
            />
          ) : (
            <HouseholdReceipt rows={receiptRows} budget={app.budget} compact={emailOpen} summary={choiceChips.join(' · ')} />
          )}

          <View style={styles.bottom}>
          {emailOpen ? null : agreeRow}
          <View style={styles.actions}>
            {emailOpen ? (
              <EmailAuthForm initialMode={loginOnly ? 'signin' : 'signup'} onSubmit={withEmail} onBack={() => toggleEmail(false)} />
            ) : (
              <>
                <ProviderButton provider="apple" disabled={busy} onPress={() => withProvider('apple')} />
                <ProviderButton provider="google" disabled={busy} onPress={() => withProvider('google')} />
                <TextButton label={t('Use email instead')} onPress={() => toggleEmail(true)} />
              </>
            )}
            {error ? (
              <AppText variant="subhead" color={c.warn} accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.center}>
                {error}
              </AppText>
            ) : null}
          </View>
          {emailOpen ? agreeRow : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingTop: 4 },
  // flexGrow plus spread gives the header, the card, and the sign-in buttons equal air between them, with the buttons at the
  // bottom of the screen in thumb reach.
  content: { flexGrow: 1, paddingHorizontal: space.gutter, paddingTop: 2, paddingBottom: 12, alignItems: 'stretch', gap: 12 },
  copy: { gap: 8, alignSelf: 'stretch' },
  center: { textAlign: 'center' },
  helloCopy: { flex: 1, gap: 8 },
  helloRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  waiting: { alignSelf: 'stretch', borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, gap: 14, flexGrow: 1, justifyContent: 'center' },
  waitPip: { alignItems: 'center' },
  waitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  waitIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  spread: { justifyContent: 'space-between' },
  bottom: { alignSelf: 'stretch', gap: 10 },
  actions: { alignSelf: 'stretch', gap: 10 },
  agree: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  agreeText: { flex: 1 },
  link: { textDecorationLine: 'underline' },
});
