import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing, type } from '@/theme';
import { Text } from './Text';

type Props = {
  label: string;
  color?: string;
  /**
   * `badge` is the small outlined uppercase tag ("64%", "SERVER CONFIRMED", "ACTIVE").
   * `status` is the tinted chip with a coloured dot ("GPS locked · 14 fixes").
   */
  kind?: 'badge' | 'status';
  /** Adds a filled dot before the label. `status` pills always have one. */
  dot?: boolean;
  /** Filled badge (e.g. the MAX amount chip when selected). */
  filled?: boolean;
  style?: ViewStyle;
};

export function Pill({ label, color = colors.redHot, kind = 'badge', dot, filled, style }: Props) {
  if (kind === 'status') {
    return (
      <View style={[styles.status, style]}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <Text style={type.mono} color={colors.inkDim}>
          {label}
        </Text>
      </View>
    );
  }
  return (
    <View
      style={[styles.badge, { borderColor: color }, filled && { backgroundColor: `${color}22` }, style]}
    >
      {dot ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text variant="label" color={color} style={styles.badgeText}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { letterSpacing: 0.6 },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.pillFill,
    borderRadius: radius.pill,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
