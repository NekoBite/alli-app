import { type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { Text } from './Text';

type Props = {
  label: string;
  value?: string;
  valueColor?: string;
  /** Renders instead of `value` when you need a component on the right. */
  right?: ReactNode;
  emphasis?: boolean;
};

/** Label-left / value-right line used in summaries, checkout and receipts. */
export function Row({ label, value, valueColor, right, emphasis }: Props) {
  return (
    <View style={styles.root}>
      <Text variant={emphasis ? 'bodyStrong' : 'body'} color={emphasis ? colors.ink : colors.ink2}>
        {label}
      </Text>
      {right ?? (
        <Text variant="bodyStrong" color={valueColor ?? colors.ink}>
          {value}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
});
