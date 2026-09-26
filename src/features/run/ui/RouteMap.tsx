import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors, radius } from '@/theme';
import type { GeoPoint } from '../types';

type Props = {
  track: GeoPoint[];
  height?: number;
};

/**
 * A schematic of the route: the accepted fixes projected onto a flat box, start as a ring and the
 * live position as a dot. It is not a map — no tiles, no network — just enough to see the shape.
 */
export function RouteMap({ track, height = 110 }: Props) {
  const width = 320;
  const pad = 14;
  if (track.length < 2) {
    return <View style={[styles.box, { height }]} accessibilityLabel="Route: waiting for GPS" />;
  }
  const lat0 = track[0]!.latitude;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = track.map((p) => p.longitude * kx);
  const ys = track.map((p) => p.latitude);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const scale = Math.min((width - pad * 2) / Math.max(maxX - minX, span * 0.2), (height - pad * 2) / Math.max(maxY - minY, span * 0.2));
  const ox = (width - (maxX - minX) * scale) / 2;
  const oy = (height - (maxY - minY) * scale) / 2;
  const pts = track.map((_, i) => [ox + (xs[i]! - minX) * scale, height - (oy + (ys[i]! - minY) * scale)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
  const [sx, sy] = pts[0]!;
  const [ex, ey] = pts[pts.length - 1]!;

  return (
    <View style={[styles.box, { height }]} accessibilityLabel="Route so far">
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        <Defs>
          <LinearGradient id="route" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.red} />
            <Stop offset="1" stopColor={colors.redHot} />
          </LinearGradient>
        </Defs>
        <Path d={d} stroke="url(#route)" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Circle cx={sx} cy={sy} r={5} fill={colors.bg} stroke={colors.ink} strokeWidth={2} />
        <Circle cx={ex} cy={ey} r={7} fill={colors.redHot} stroke={colors.ink} strokeWidth={2} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
    overflow: 'hidden',
  },
});
