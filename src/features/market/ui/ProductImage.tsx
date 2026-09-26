import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, type ViewStyle } from 'react-native';

import { Text } from '@/components';
import { colors, radius } from '@/theme';

/**
 * Placeholder for product photography: the wireframes' warm red block with a mono caption.
 * Swap for an <Image> once listings carry photos.
 */
export function ProductImage({ label = 'IMG', style }: { label?: string; style?: ViewStyle }) {
  return (
    <LinearGradient
      colors={['#6A2412', '#3A120A']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.root, style]}
    >
      <Text variant="label" color="rgba(255, 106, 61, 0.55)">
        {label}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
