import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme';

// A meal's photo. Decorative: the dish name beside it already says what it is, so screen readers skip it. The tinted
// block shows while the photo loads, and a meal with no photo renders nothing, so layouts need no special case.
export function MealPhoto({
  uri,
  height,
  width,
  radius = 14,
  style,
}: {
  uri?: string;
  height: number;
  width?: number | '100%';
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  if (!uri) return null;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[{ height, width: width ?? '100%', borderRadius: radius, backgroundColor: c.track, overflow: 'hidden' }, style]}
    >
      <Image source={{ uri }} style={styles.fill} contentFit="cover" transition={220} cachePolicy="memory-disk" />
    </View>
  );
}

const styles = StyleSheet.create({ fill: { width: '100%', height: '100%' } });
