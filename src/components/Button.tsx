import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';
import { Gradient } from './Gradient';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  label: string;
  onPress?: () => void;
  onLongPress?: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  /** Small text under the label, e.g. a price. */
  hint?: string;
  /** Renders before the label, e.g. the provider's initial. */
  icon?: React.ReactNode;
  style?: ViewStyle;
};

const labelColors: Record<Variant, string> = {
  primary: colors.onRed,
  secondary: colors.ink,
  ghost: colors.redHot,
  danger: colors.danger,
};

/**
 * Primary is the red gradient with a glow; secondary is the hairline "ghost card" button the
 * wireframes pair it with (Pause / Finish, Back up now / Let's go).
 */
export function Button({
  label,
  onPress,
  onLongPress,
  variant = 'primary',
  size = 'md',
  disabled,
  loading,
  hint,
  icon,
  style,
}: Props) {
  const inert = disabled || loading;
  const fg = labelColors[variant];
  const content = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    <View style={styles.labels}>
      <View style={styles.labelRow}>
        {icon}
        <Text style={[type.bodyStrong, size === 'sm' ? styles.labelSm : styles.label, { color: fg }]}>
          {label}
        </Text>
      </View>
      {hint ? (
        <Text variant="caption" style={{ color: fg, opacity: 0.75 }}>
          {hint}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!inert, busy: !!loading }}
      onPress={inert ? undefined : onPress}
      onLongPress={inert ? undefined : onLongPress}
      style={({ pressed }) => [
        styles.base,
        sizes[size],
        variant === 'primary' && styles.glow,
        variant === 'secondary' && styles.secondary,
        variant === 'danger' && styles.danger,
        pressed && !inert && styles.pressed,
        inert && styles.disabled,
        style,
      ]}
    >
      {variant === 'primary' ? (
        <Gradient style={[StyleSheet.absoluteFill, { borderRadius: sizes[size].borderRadius }]} />
      ) : null}
      {content}
    </Pressable>
  );
}

const sizes = StyleSheet.create({
  sm: { minHeight: 34, borderRadius: 10, paddingHorizontal: spacing.md },
  md: { minHeight: 49, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  lg: { minHeight: 52, borderRadius: radius.md, paddingHorizontal: spacing.lg },
});

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    overflow: 'visible',
  },
  glow: {
    shadowColor: colors.red,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  secondary: {
    backgroundColor: colors.ghostFill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  danger: { backgroundColor: colors.dangerFill, borderWidth: 1, borderColor: colors.danger },
  labels: { alignItems: 'center', gap: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontSize: 16 },
  labelSm: { fontSize: 14 },
  pressed: { opacity: 0.82 },
  disabled: { opacity: 0.4 },
});
