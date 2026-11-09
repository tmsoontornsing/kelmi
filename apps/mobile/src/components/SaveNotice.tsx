import { StyleSheet, View } from 'react-native';

import { useT } from '../i18n';
import { useApp } from '../state/AppState';
import { radius, space, useTheme } from '../theme';
import { AppText } from './AppText';
import { TextButton } from './Buttons';

// Shown when the household (allergies, diet, size, budget) did not save. It stays until a save goes through, because an
// allergy change only protects the person once it is saved.
export function SaveNotice() {
  const c = useTheme();
  const { t } = useT();
  const app = useApp();
  if (!app.profileSaveFailed) return null;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.box, { backgroundColor: c.warnBg }]}>
      <AppText variant="subhead" color={c.warn} weight="500" style={styles.text}>
        {app.profileSaveHint ?? t('Your changes didn’t save. Allergy and diet changes only count once they are saved.')}
      </AppText>
      <TextButton label={t('Retry')} color={c.warn} onPress={app.retryProfileSave} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: space.gutter, marginBottom: 8, paddingLeft: 12, paddingRight: 8, paddingVertical: 8, borderRadius: radius.control },
  text: { flex: 1 },
});
