import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { Text } from './Text';

type Props = {
  label: string;
  /** 0–1. */
  value: number;
  /** 0–1. The line the meter has to stay above; drawn as a tick. */
  threshold: number;
};

/**
 * A care meter (Water / Sun / Soil): red while above the line, amber once below it, with the line
 * drawn as a tick across the track.
 */
export function Meter({ label, value, threshold }: Props) {
  const v = Math.min(1, Math.max(0, value));
  const low = v < threshold;
  const tone = low ? colors.warn : colors.redHot;
  return (
    <View style={styles.row} accessibilityLabel={`${label} ${Math.round(v * 100)} percent${low ? ', below the line' : ''}`}>
      <Text variant="caption" style={styles.label}>
        {label}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${v * 100}%`, backgroundColor: tone }]} />
        <View style={[styles.tick, { left: `${threshold * 100}%` }]} />
      </View>
      <Text variant="mono" color={low ? colors.warn : colors.inkDim} style={styles.pct}>
        {Math.round(v * 100)}%
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 5 },
  label: { width: 56, color: colors.ink },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
    justifyContent: 'center',
  },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 3 },
  tick: {
    position: 'absolute',
    width: 2,
    height: 16,
    marginLeft: -1,
    borderRadius: 1,
    backgroundColor: colors.ink,
  },
  pct: { width: 38, textAlign: 'right' },
});
