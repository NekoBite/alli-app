import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components';
import { colors, spacing } from '@/theme';
import type { GameProps } from './types';

/** Web build of any minigame: the field needs Skia, which is not wired up for web yet. */
export function WebFallback({ width, height, onFinish }: GameProps) {
  return (
    <View style={[styles.root, { width, height }]}>
      <Text variant="body" color={colors.inkDim} center>
        Minigames render on iOS and Android.
      </Text>
      <Button label="Back" variant="secondary" onPress={() => onFinish(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
});
