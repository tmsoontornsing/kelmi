import { NativeTabs } from 'expo-router/native-tabs';

import { useT } from '../../i18n';
import { fonts, useTheme } from '../../theme';

// System tab bar (UITabBar on iOS, Material bottom navigation on Android).
export default function TabsLayout() {
  const c = useTheme();
  const { t } = useT();
  return (
    // A solid bar: left to the system default it goes see-through at the end of a scroll and the page text shows
    // through the icons.
    <NativeTabs
      tintColor={c.primary}
      backgroundColor={c.card}
      disableTransparentOnScrollEdge
      labelStyle={{ fontFamily: fonts.medium, fontSize: 11 }}
    >
      <NativeTabs.Trigger name="week">
        <NativeTabs.Trigger.Label>{t('This Week')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="groceries">
        <NativeTabs.Trigger.Label>{t('Groceries')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'cart', selected: 'cart.fill' }} md="shopping_cart" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="pantry">
        <NativeTabs.Trigger.Label>{t('Pantry')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'cabinet', selected: 'cabinet.fill' }} md="kitchen" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>{t('Settings')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
