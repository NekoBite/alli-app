import { StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { colors, radius, spacing } from '@/theme';

type Props = {
  taps: number;
  needed: number;
  filled: boolean;
  /** Why the count is higher than usual today, if it is. */
  note?: string;
};

/** The sun meter: taps on the tree today against what it needs. */
export function TapMeter({ taps, needed, filled, note }: Props) {
  const pct = filled ? 100 : Math.min(100, Math.round((taps / Math.max(1, needed)) * 100));
  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text variant="bodyStrong" color={filled ? colors.green : colors.ink}>
          {filled ? 'Sun is full for today' : 'Tap the tree for sun'}
        </Text>
        <Text variant="caption" color={colors.ink2}>
          {filled ? '✓' : `${Math.min(taps, needed)} / ${needed}`}
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: pct }}
        style={styles.track}
      >
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      {note ? (
        <Text variant="caption" color={colors.warning}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: {
    height: 8,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.gold },
});
