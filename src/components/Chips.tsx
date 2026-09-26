import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { Text } from './Text';

type Option<T extends string> = { value: T; label: string; disabled?: boolean };

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Round chips (sizes) instead of pills (categories, generations, amount presets). */
  round?: boolean;
};

/** Filter / variant chips. Horizontal scroll so a long list never wraps. */
export function Chips<T extends string>({ options, value, onChange, round }: Props<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active, disabled: !!opt.disabled }}
            disabled={opt.disabled}
            onPress={() => onChange(opt.value)}
            style={[
              styles.chip,
              round && styles.round,
              active && styles.active,
              opt.disabled && styles.disabled,
            ]}
          >
            <Text variant="mono" color={active ? colors.redHot : colors.inkDim}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  round: { width: 36, height: 36, paddingHorizontal: 0 },
  active: { borderColor: colors.redHot, backgroundColor: 'rgba(226, 69, 34, 0.18)' },
  disabled: { opacity: 0.35 },
});
