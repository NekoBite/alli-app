import { StyleSheet, View } from 'react-native';

import { Button, Text } from '@/components';
import { colors, spacing } from '@/theme';
import type { GameProps } from './types';

export const COMPOST_GOAL = 12;

/** Web build: the field needs Skia, which is not wired up for web yet. */
export function CompostGame({ width, height, onFinish }: GameProps) {
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
