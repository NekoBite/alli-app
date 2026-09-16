import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/theme';

type Props = {
  /** 0–1. Values outside the range are clamped. */
  progress: number;
  color?: string;
  height?: number;
};

export function ProgressBar({ progress, color = colors.green, height = 8 }: Props) {
  const pct = Math.round(Math.min(1, Math.max(0, progress)) * 100);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={[styles.track, { height }]}
    >
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
});
