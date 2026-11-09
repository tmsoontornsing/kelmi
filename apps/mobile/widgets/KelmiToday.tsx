import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { bold, font, foregroundStyle, lineLimit } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type KelmiTodayProps = {
  breakfast: string;
  lunch: string;
  dinner: string;
  done: number;
  total: number;
  // Every piece of text, translated by src/lib/widgets.ts: this runtime can't reach the app's translator.
  dinnerHeader: string; // small size, "DINNER · MONDAY"
  todayHeader: string; // medium size, "TODAY · MONDAY"
  cartText: string; // "3 of 12 in cart" or "No list yet"
  planPrompt: string; // "Plan your week", when there is no dinner
  breakfastLabel: string;
  lunchLabel: string;
  dinnerLabel: string;
  inCartLabel: string; // "in cart", under the count
};

// Today's three meals and how far along the grocery trip is. Runs in an isolated widget runtime: no hooks,
// no imports of app code, everything arrives through props. Colours are left to the system in tinted
// (accented) mode so the person's chosen home screen tint applies.
const KelmiToday = (props: KelmiTodayProps, env: WidgetEnvironment) => {
  'widget';
  const tinted = env.widgetRenderingMode === 'accented';
  const green = tinted ? undefined : '#1F7A4D';
  const accent = (modifiers: ReturnType<typeof bold>[]) => (green ? [...modifiers, foregroundStyle(green)] : modifiers);

  if (env.widgetFamily === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={4}>
        <Text modifiers={accent([font({ size: 11, weight: 'bold' })])}>{props.dinnerHeader}</Text>
        <Text modifiers={[font({ size: 17, weight: 'semibold' }), lineLimit(3)]}>{props.dinner || props.planPrompt}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 12 })]}>{props.cartText}</Text>
      </VStack>
    );
  }

  const rows: [string, string][] = [
    [props.breakfastLabel, props.breakfast],
    [props.lunchLabel, props.lunch],
    [props.dinnerLabel, props.dinner],
  ];
  return (
    <HStack alignment="top" spacing={12}>
      <VStack alignment="leading" spacing={5}>
        <Text modifiers={accent([font({ size: 11, weight: 'bold' })])}>{props.todayHeader}</Text>
        {rows.map(([label, name]) => (
          <HStack key={label} spacing={6}>
            <Text modifiers={[font({ size: 12 }), foregroundStyle('secondary')]}>{label}</Text>
            <Text modifiers={[font({ size: 14, weight: 'medium' }), lineLimit(1)]}>{name || '—'}</Text>
          </HStack>
        ))}
      </VStack>
      <Spacer />
      <VStack alignment="trailing" spacing={2}>
        <Text modifiers={[bold(), font({ size: 22 })]}>{`${props.done}/${props.total}`}</Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle('secondary')]}>{props.inCartLabel}</Text>
      </VStack>
    </HStack>
  );
};

export default createWidget<KelmiTodayProps>('KelmiToday', KelmiToday, {
  breakfast: '',
  lunch: '',
  dinner: '',
  done: 0,
  total: 0,
  dinnerHeader: 'DINNER',
  todayHeader: 'TODAY',
  cartText: 'No list yet',
  planPrompt: 'Plan your week',
  breakfastLabel: 'Breakfast',
  lunchLabel: 'Lunch',
  dinnerLabel: 'Dinner',
  inCartLabel: 'in cart',
});
