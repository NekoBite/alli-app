import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { Text } from '@/components';
import { colors, fonts } from '@/theme';
import { formatPoints } from '@/utils/format';

type Props = {
  steps: number;
  stepGoal: number;
  activeMinutes: number;
  minuteGoal: number;
  size?: number;
};

/**
 * The live-run rings (2.3): outer = steps toward the daily quest (red → red-hot), inner = active
 * minutes toward the day's target (amber). A dot marks each ring's start; the head sits at the
 * live position. Past 100% a ring stays full.
 */
export function ActivityRings({ steps, stepGoal, activeMinutes, minuteGoal, size = 260 }: Props) {
  const outerW = 18;
  const innerW = 12;
  const c = size / 2;
  const rOuter = c - outerW / 2 - 2;
  const rInner = rOuter - outerW / 2 - innerW / 2 - 8;
  const outer = Math.min(1, steps / stepGoal);
  const inner = Math.min(1, activeMinutes / minuteGoal);

  const ring = (r: number, width: number, frac: number, stroke: string, track: string, head: string) => {
    const circ = 2 * Math.PI * r;
    const angle = frac * 2 * Math.PI - Math.PI / 2;
    return (
      <>
        <Circle cx={c} cy={c} r={r} stroke={track} strokeWidth={width} fill="none" />
        {frac > 0 ? (
          <Circle
            cx={c}
            cy={c}
            r={r}
            stroke={stroke}
            strokeWidth={width}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${circ * frac} ${circ}`}
            transform={`rotate(-90 ${c} ${c})`}
          />
        ) : null}
        <Circle cx={c} cy={c - r} r={width / 4} fill={colors.bg} opacity={0.7} />
        {frac > 0 ? (
          <Circle
            cx={c + r * Math.cos(angle)}
            cy={c + r * Math.sin(angle)}
            r={width / 2 - 1}
            fill={head}
            stroke={colors.bg}
            strokeWidth={2}
          />
        ) : null}
      </>
    );
  };

  return (
    <View
      style={{ width: size, height: size }}
      accessibilityLabel={`${formatPoints(steps)} of ${formatPoints(stepGoal)} steps, ${Math.round(activeMinutes)} of ${minuteGoal} active minutes`}
    >
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="stepRing" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.red} />
            <Stop offset="1" stopColor={colors.redHot} />
          </LinearGradient>
        </Defs>
        {ring(rOuter, outerW, outer, 'url(#stepRing)', 'rgba(226, 69, 34, 0.14)', colors.redHot)}
        {ring(rInner, innerW, inner, colors.warn, 'rgba(232, 184, 75, 0.12)', colors.warn)}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={styles.steps}>{formatPoints(steps)}</Text>
        <Text variant="mono" color={colors.inkDim}>
          <Text variant="mono" color={colors.redHot}>●</Text> Steps{' '}
          <Text variant="mono" color={colors.inkFaint}>
            / {formatPoints(stepGoal)}
          </Text>
        </Text>
        <Text variant="mono" color={colors.warn} style={styles.minutes}>
          ● {Math.round(activeMinutes)} / {minuteGoal} min
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  steps: { fontFamily: fonts.display, fontSize: 52, lineHeight: 58, color: colors.redHot, letterSpacing: -1 },
  minutes: { marginTop: 2 },
});
