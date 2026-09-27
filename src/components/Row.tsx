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
  /** Bold total line ("Total", "You pay"): Inter label, display-weight value. */
  emphasis?: boolean;
};

/** Label-left / mono value-right line used in breakdowns, checkout and receipts. */
export function Row({ label, value, valueColor, right, emphasis }: Props) {
  return (
    <View style={styles.root}>
      <Text
        variant={emphasis ? 'bodyStrong' : 'caption'}
        color={emphasis ? colors.ink : colors.inkDim}
        style={!emphasis && styles.label}
      >
        {label}
      </Text>
      {right ?? (
        <Text
          variant={emphasis ? 'figure' : 'monoStrong'}
          color={valueColor ?? (emphasis ? colors.redHot : colors.ink)}
        >
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
    paddingVertical: 5,
  },
  label: { fontSize: 14, flexShrink: 1 },
});
