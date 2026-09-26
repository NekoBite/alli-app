import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { Text } from './Text';

type Props = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
};

/** The − n + quantity control (cart lines, product quantity). */
export function Stepper({ value, onChange, min = 0, max = 99, label = 'Quantity' }: Props) {
  return (
    <View style={styles.root} accessibilityLabel={`${label} ${value}`}>
      <Step glyph="−" label={`Decrease ${label.toLowerCase()}`} disabled={value <= min} onPress={() => onChange(value - 1)} />
      <Text variant="monoStrong" style={styles.value}>
        {value}
      </Text>
      <Step glyph="+" label={`Increase ${label.toLowerCase()}`} disabled={value >= max} onPress={() => onChange(value + 1)} />
    </View>
  );
}

function Step({ glyph, label, disabled, onPress }: { glyph: string; label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={[styles.btn, disabled && { opacity: 0.35 }]}
    >
      <Text variant="bodyStrong">{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  btn: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { minWidth: 14, textAlign: 'center' },
});
