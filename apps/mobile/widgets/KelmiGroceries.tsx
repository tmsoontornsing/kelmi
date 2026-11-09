import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { bold, font, foregroundStyle, lineLimit } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type KelmiGroceriesProps = {
  // Items still to buy, in aisle order, already trimmed to what the biggest size can show, joined with "|".
  // A plain string, because widget props travel as simple values.
  items: string;
  done: number;
  total: number;
  // Every piece of text, translated by src/lib/widgets.ts: this runtime can't reach the app's translator.
  title: string; // the empty state's heading, "GROCERIES"
  header: string; // "GROCERIES · 5 LEFT"
  emptyText: string; // "Everything is in your cart" or "Plan your week to build a list"
  progress: string; // "3 of 12 items", under the empty state
  // The line under the list for each size, since each shows a different number of items: "and 4 more · 3 of 12 in cart".
  footerSmall: string;
  footerMedium: string;
  footerLarge: string;
};

// The grocery list at a glance: what is left to buy and how far along the trip is. Runs in an isolated widget
// runtime: no hooks, no imports of app code, everything arrives through props. Colours are left to the system in
// tinted (accented) mode so the person's chosen home screen tint applies.
const KelmiGroceries = (props: KelmiGroceriesProps, env: WidgetEnvironment) => {
  'widget';
  const tinted = env.widgetRenderingMode === 'accented';
  const green = tinted ? undefined : '#1F7A4D';
  const accent = (modifiers: ReturnType<typeof bold>[]) => (green ? [...modifiers, foregroundStyle(green)] : modifiers);
  const list = props.items ? props.items.split('|') : [];

  const row = (name: string) => (
    <HStack key={name} spacing={6}>
      <Text modifiers={[font({ size: 12 }), foregroundStyle('secondary')]}>○</Text>
      <Text modifiers={[font({ size: 13, weight: 'medium' }), lineLimit(1)]}>{name}</Text>
    </HStack>
  );

  // Nothing to show: no list yet, or everything is in the cart.
  if (list.length === 0) {
    return (
      <HStack alignment="top">
        <VStack alignment="leading" spacing={4}>
          <Text modifiers={accent([font({ size: 11, weight: 'bold' })])}>{props.title}</Text>
          <Text modifiers={[font({ size: 17, weight: 'semibold' }), lineLimit(3)]}>
            {props.emptyText}
          </Text>
          <Spacer />
          {props.total > 0 ? <Text modifiers={[font({ size: 12 })]}>{props.progress}</Text> : null}
        </VStack>
        <Spacer />
      </HStack>
    );
  }

  // One column of items in the small size; two in the medium; the large size fills both columns taller.
  // GROCERY_SHOWN in src/lib/widgets.ts must match, since it writes each size's footer.
  const perColumn = env.widgetFamily === 'systemSmall' ? 4 : env.widgetFamily === 'systemMedium' ? 4 : 9;
  const columns = env.widgetFamily === 'systemSmall' ? 1 : 2;
  const shown = list.slice(0, perColumn * columns);
  const slices = Array.from({ length: columns }, (_, c) => shown.slice(c * perColumn, (c + 1) * perColumn));
  const footer = env.widgetFamily === 'systemSmall' ? props.footerSmall : env.widgetFamily === 'systemMedium' ? props.footerMedium : props.footerLarge;

  return (
    <VStack alignment="leading" spacing={6}>
      <HStack>
        <Text modifiers={accent([font({ size: 11, weight: 'bold' })])}>{props.header}</Text>
        <Spacer />
      </HStack>
      <HStack alignment="top" spacing={14}>
        {slices.map((slice, c) => (
          <VStack key={c} alignment="leading" spacing={4}>
            {slice.map(row)}
          </VStack>
        ))}
        <Spacer />
      </HStack>
      <Spacer />
      <HStack>
        <Text modifiers={[font({ size: 11 }), foregroundStyle('secondary')]}>
          {footer}
        </Text>
        <Spacer />
      </HStack>
    </VStack>
  );
};

export default createWidget<KelmiGroceriesProps>('KelmiGroceries', KelmiGroceries, {
  items: '',
  done: 0,
  total: 0,
  title: 'GROCERIES',
  header: 'GROCERIES',
  emptyText: 'Plan your week to build a list',
  progress: '0 of 0 items',
  footerSmall: '0 of 0 in cart',
  footerMedium: '0 of 0 in cart',
  footerLarge: '0 of 0 in cart',
});
