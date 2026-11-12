import Ionicons from '@expo/vector-icons/Ionicons';
import * as Sharing from 'expo-sharing';
import { useRef, useState, type ComponentRef, type RefObject } from 'react';
import { Alert, Pressable, Share, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { useT } from '../i18n';
import { haptic } from '../motion';
import { useApp } from '../state/AppState';
import { fonts, radius, useTheme } from '../theme';
import { AppText } from './AppText';
import { Card, PrimaryButton } from './Buttons';
import { Mascot } from './Mascot';

// Colors on the share picture are fixed, so a post looks the same whatever theme the phone is in.
const CARD = { bg: '#A7D96B', ink: '#13241A', star: '#13241A', starOff: 'rgba(19,36,26,0.22)', pill: '#13241A', pillText: '#F7FAF5' };

const Stars = ({ value, size, color, off }: { value: number; size: number; color: string; off: string }) => (
  <View style={styles.starRow}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Ionicons key={n} name="star" size={size} color={n <= value ? color : off} />
    ))}
  </View>
);

// The picture that gets shared: Pip, the dish, the stars, and where to find Kelmi. Drawn off screen and captured on demand.
// It holds the dish name and the rating and nothing about the person who cooked it.
function ShareCard({ name, stars, innerRef }: { name: string; stars: number; innerRef: RefObject<ComponentRef<typeof View> | null> }) {
  const { t } = useT();
  return (
    <View ref={innerRef} collapsable={false} style={[styles.card, { backgroundColor: CARD.bg }]}>
      <View style={styles.cardTop}>
        <View style={[styles.pill, { backgroundColor: CARD.pill }]}>
          <AppText style={styles.pillText} color={CARD.pillText}>{t('Made it. Loved it.')}</AppText>
        </View>
      </View>
      <Mascot pose="love" size={360} decorative animate={false} style={styles.pip} />
      <View style={styles.cardBottom}>
        <AppText style={styles.cardName} color={CARD.ink} numberOfLines={3}>{name}</AppText>
        <Stars value={stars} size={64} color={CARD.star} off={CARD.starOff} />
        <AppText style={styles.cardFoot} color={CARD.ink}>{t('Planned with Kelmi · usekavi.com')}</AppText>
      </View>
    </View>
  );
}

// How the meal turned out. Four or five stars unlock a picture to share, through the phone's share sheet, so it can go to
// Instagram, Messages or anywhere else the person already uses.
export function RateMeal({ recipeId, name }: { recipeId: string; name: string }) {
  const c = useTheme();
  const app = useApp();
  const { t, tn } = useT();
  const stars = app.ratings[recipeId] ?? 0;
  const cardRef = useRef<ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);

  const rate = (n: number) => {
    haptic.select();
    app.rateMeal(recipeId, n).catch((e) => Alert.alert(t('Couldn’t save your rating'), (e as Error).message));
  };

  const share = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const uri = await captureRef(cardRef, { format: 'png', quality: 1, result: 'tmpfile', width: 1080, height: 1350 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: t('Share your meal') });
      } else {
        await Share.share({ message: t('I made {name} with Kelmi and gave it {n} stars. usekavi.com', { name, n: stars }) });
      }
    } catch {
      // The picture couldn't be made; a plain message still shares.
      Share.share({ message: t('I made {name} with Kelmi and gave it {n} stars. usekavi.com', { name, n: stars }) }).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={styles.box}>
      <AppText variant="headline" accessibilityRole="header">{stars ? t('You rated it') : t('How was it?')}</AppText>
      <View style={styles.pick}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={tn(n, 'Rate {n} star', 'Rate {n} stars')}
            accessibilityState={{ selected: n === stars }}
            hitSlop={4}
            onPress={() => rate(n)}
            style={styles.starBtn}
          >
            <Ionicons name={n <= stars ? 'star' : 'star-outline'} size={34} color={n <= stars ? c.primary : c.control} />
          </Pressable>
        ))}
      </View>
      <AppText variant="subhead">
        {stars === 0
          ? t('Tap a star. Your ratings are private.')
          : stars >= 4
            ? t('Glad it worked out. Want to show it off?')
            : t('Thanks for telling us.')}
      </AppText>
      {stars >= 4 ? <PrimaryButton label={busy ? t('Making your picture…') : t('Share this meal')} onPress={share} feedback="none" loading={busy} /> : null}
      {/* Off screen: the picture is drawn here so it can be captured at full size. */}
      <View pointerEvents="none" style={styles.offscreen} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <ShareCard name={name} stars={stars || 5} innerRef={cardRef} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  box: { padding: 16, gap: 10 },
  pick: { flexDirection: 'row', gap: 4, marginLeft: -4 },
  starBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  starRow: { flexDirection: 'row', gap: 10 },
  offscreen: { position: 'absolute', left: -5000, top: 0, width: 1080, height: 1350 },
  card: { width: 1080, height: 1350, paddingHorizontal: 80, paddingVertical: 90, justifyContent: 'space-between' },
  cardTop: { alignItems: 'flex-start' },
  pill: { paddingHorizontal: 36, paddingVertical: 18, borderRadius: radius.pill },
  pillText: { fontFamily: fonts.displaySemi, fontSize: 40 },
  pip: { alignSelf: 'center' },
  cardBottom: { gap: 28 },
  cardName: { fontFamily: fonts.display, fontSize: 96, lineHeight: 100, letterSpacing: -2 },
  cardFoot: { fontFamily: fonts.medium, fontSize: 38 },
});
