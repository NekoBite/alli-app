import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { Gradient } from './Gradient';

type Props = {
  /** 0–1. Values outside the range are clamped. */
  progress: number;
  /** A flat colour instead of the primary gradient. */
  color?: string;
  height?: number;
};

export function ProgressBar({ progress, color, height = 8 }: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const fill = { width: `${pct}%` as const, borderRadius: height / 2 };

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={[styles.track, { height, borderRadius: height / 2 }]}
    >
      {color ? (
        <View style={[styles.fill, fill, { backgroundColor: color }]} />
      ) : (
        <Gradient style={[styles.fill, fill]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  fill: { height: '100%' },
});
