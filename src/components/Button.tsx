import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';
import { Text } from './Text';

type Variant = 'primary' | 'premium' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  /** Small text under the label, e.g. a price. */
  hint?: string;
  style?: ViewStyle;
};

const fills: Record<Variant, ViewStyle> = {
  primary: { backgroundColor: colors.green },
  premium: { backgroundColor: colors.gold },
  secondary: { backgroundColor: colors.surfaceAlt, borderWidth: 1, borderColor: colors.line },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.dangerFill, borderWidth: 1, borderColor: colors.danger },
};

const labelColors: Record<Variant, string> = {
  primary: colors.onGreen,
  premium: colors.onGold,
  secondary: colors.ink,
  ghost: colors.green,
  danger: colors.danger,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  hint,
  style,
}: Props) {
  const inert = disabled || loading;
  const fg = labelColors[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      onPress={inert ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' && styles.lg,
        fills[variant],
        pressed && !inert && styles.pressed,
        inert && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.labels}>
          <Text style={[type.bodyStrong, { color: fg }]}>{label}</Text>
          {hint ? (
            <Text variant="caption" style={{ color: fg, opacity: 0.75 }}>
              {hint}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  lg: { minHeight: 56, borderRadius: radius.lg },
  labels: { alignItems: 'center', gap: 2 },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.4 },
});
