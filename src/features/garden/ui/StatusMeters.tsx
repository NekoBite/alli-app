import { StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { colors, radius, spacing } from '@/theme';
import { countdown } from '@/utils/time';
import type { StatusView } from '../types';

/**
 * The three care meters with the line each must stay above. The line moves
 * with conditions and practices, which is why it is drawn rather than implied.
 */
export function StatusMeters({ meters }: { meters: StatusView[] }) {
  return (
    <View style={styles.root}>
      {meters.map((meter) => (
        <Meter key={meter.id} meter={meter} />
      ))}
    </View>
  );
}

function Meter({ meter }: { meter: StatusView }) {
  const pct = Math.round(meter.level * 100);
  const color = meter.level <= 0 ? colors.danger : meter.ok ? colors.green : colors.warning;
  const note =
    meter.level <= 0
      ? 'Empty'
      : meter.ok
        ? `Below the line in ${countdown(meter.msUntilBelow)}`
        : 'Below the line';

  return (
    <View style={styles.meter}>
      <View style={styles.head}>
        <Text variant="label" color={colors.ink2}>
          {meter.label}
        </Text>
        <Text variant="caption" color={meter.ok ? colors.ink2 : color}>
          {note}
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`${meter.label} ${pct}%`}
        accessibilityValue={{ min: 0, max: 100, now: pct }}
        style={styles.track}
      >
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
        <View style={[styles.line, { left: `${Math.round(meter.threshold * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  meter: { gap: spacing.xs },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  track: {
    height: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
  line: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.ink,
    opacity: 0.7,
  },
});
