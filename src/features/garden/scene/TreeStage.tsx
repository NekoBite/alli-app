import { Canvas, Circle, Group, Path, Rect } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import {
  Easing,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Text } from '@/components';
import { colors, radius, spacing } from '@/theme';
import { CONDITIONS } from '../rules';
import type { ConditionId, PlotView } from '../types';
import { PALETTES, seasonFor, type Season } from './palette';
import { grassPath } from './shapes';
import { Sapling, Seedling, Sparkle, Sprout, Tree } from './sprites';
import {
  hitPlant,
  hitSparkle,
  layoutStage,
  petalFor,
  rand,
  sparkleSpots,
  starPointsFor,
  type SparkleSpot,
} from './stage';
import { visualFor } from './visual';

type Props = {
  view: PlotView;
  /** Defaults to the current meteorological season. */
  season?: Season;
  height?: number;
  /** Sparkles already popped by the player this session, hidden until the server confirms. */
  popped?: number;
  /** Tap on the tree itself: the sun meter's input. */
  onTapTree?: () => void;
  /** Tap on a sparkle. */
  onTapSparkle?: (spot: SparkleSpot) => void;
};

const DEFAULT_HEIGHT = 320;
/** Matches `easeOutBack` in the sketch. */
const POP = Easing.out(Easing.back(1.70158));

/** What the sky wears under each condition. */
const OVERLAYS: Partial<Record<ConditionId, { color: string; opacity: number }>> = {
  haze: { color: '#8C8C8C', opacity: 0.4 },
  heatwave: { color: '#FF8A3D', opacity: 0.16 },
  drought: { color: '#FFB347', opacity: 0.2 },
  monsoon: { color: '#3B4A6B', opacity: 0.3 },
};

/**
 * One tree on its own stage: sky, sun, hills, ground, the plant at the stage
 * and health the store says it has, and the sparkles waiting on it. Taps on
 * the tree rustle it and go to the sun meter; taps on a sparkle collect it.
 * State stays in the store, this only draws it.
 */
export function TreeStage({
  view,
  season = seasonFor(),
  height = DEFAULT_HEIGHT,
  popped = 0,
  onTapTree,
  onTapSparkle,
}: Props) {
  const [width, setWidth] = useState(0);
  const palette = PALETTES[season];
  const layout = useMemo(() => layoutStage(width, height), [width, height]);
  const visual = visualFor(view);
  const sparkleCount = Math.max(0, visual.sparkles - popped);
  const spots = useMemo(
    () => sparkleSpots(layout, visual.form, sparkleCount),
    [layout, visual.form, sparkleCount],
  );
  const tufts = useMemo(() => grassTufts(width, layout.horizon, height), [width, layout.horizon, height]);

  const pop = useSharedValue(0);
  const rustle = useSharedValue(0);
  const twinkle = useSharedValue(0);

  useEffect(() => {
    pop.value = withTiming(1, { duration: 700, easing: POP });
    twinkle.value = withRepeat(withTiming(1, { duration: 900 }), -1, true);
  }, [pop, twinkle]);

  const plantTransform = useDerivedValue(() => {
    const wobble = Math.sin(rustle.value * Math.PI);
    return [
      { translateX: layout.plant.x },
      { translateY: layout.plant.y },
      { rotate: 0.03 * Math.sin(rustle.value * Math.PI * 2) },
      { scaleX: layout.plant.scale * pop.value * (1 + 0.04 * wobble) },
      { scaleY: layout.plant.scale * pop.value * (1 - 0.03 * wobble) },
    ];
  });
  const sparkleOpacity = useDerivedValue(() => 0.65 + 0.35 * twinkle.value);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  };

  const onPress = (x: number, y: number) => {
    const sparkle = hitSparkle(spots, x, y);
    if (sparkle) {
      onTapSparkle?.(sparkle);
      return;
    }
    if (hitPlant(layout, visual.form, x, y) || y < layout.horizon + 20) {
      rustle.value = withSequence(withTiming(1, { duration: 140 }), withTiming(0, { duration: 200 }));
      onTapTree?.();
    }
  };

  const conditionLabel = view.activeConditions.map((id) => CONDITIONS[id].label).join(' · ');

  return (
    <View style={[styles.frame, { height }]} onLayout={onLayout}>
      {width > 0 ? (
        <Pressable
          accessibilityRole="image"
          accessibilityLabel={`${view.seed.name}, ${view.health}, ${sparkleCount} sparkles`}
          onPress={(event) => onPress(event.nativeEvent.locationX, event.nativeEvent.locationY)}
          style={StyleSheet.absoluteFill}
        >
          <Canvas style={{ width, height }} pointerEvents="none">
            <Rect x={0} y={0} width={width} height={height} color={palette.sky} />
            <Circle cx={layout.sun.x} cy={layout.sun.y} r={layout.sun.r} color={palette.sun} />
            {layout.hills.map((hill, index) => (
              <Circle key={`hill-${index}`} cx={hill.cx} cy={hill.cy} r={hill.r} color={palette.hill} />
            ))}
            <Rect
              x={0}
              y={layout.horizon}
              width={width}
              height={height - layout.horizon}
              color={palette.ground}
            />
            {view.activeConditions.map((id) => {
              const overlay = OVERLAYS[id];
              return overlay ? (
                <Rect
                  key={id}
                  x={0}
                  y={0}
                  width={width}
                  height={height}
                  color={overlay.color}
                  opacity={overlay.opacity}
                />
              ) : null;
            })}
            {tufts.map((tuft) => (
              <Path key={tuft.key} path={tuft.path} color={palette.grass} />
            ))}

            <Group transform={plantTransform}>
              {visual.form === 'seed' ? (
                <Seedling palette={palette} season={season} />
              ) : visual.form === 'sprout' ? (
                <Sprout palette={palette} season={season} petal={petalFor(view.id)} />
              ) : visual.form === 'sapling' ? (
                <Sapling palette={palette} season={season} />
              ) : (
                <Tree
                  palette={palette}
                  season={season}
                  health={visual.health}
                  premium={visual.premium}
                  starPoints={starPointsFor(view.id)}
                />
              )}
            </Group>

            <Group opacity={sparkleOpacity}>
              {spots.map((spot) => (
                <Sparkle key={spot.index} x={spot.x} y={spot.y} r={spot.r * 0.7} />
              ))}
            </Group>
          </Canvas>
        </Pressable>
      ) : null}

      <View pointerEvents="none" style={styles.caption}>
        <Text variant="label" color={season === 'winter' ? colors.bg : colors.ink}>
          {conditionLabel ? `${palette.title} · ${conditionLabel}` : palette.title}
        </Text>
      </View>
    </View>
  );
}

/** Decorative grass along the horizon. Deterministic, so it does not shimmer on re-render. */
function grassTufts(width: number, horizon: number, height: number) {
  if (width <= 0) return [];
  const count = Math.max(6, Math.round(width / 28));
  const tufts: { key: string; path: string }[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = ((i + 0.5) / count) * width + (rand(i, 11) - 0.5) * 12;
    const y = horizon + 4 + rand(i, 12) * (height - horizon) * 0.6;
    const g = 0.6 + rand(i, 13) * 0.6;
    const lean = rand(i, 14) < 0.5 ? 1 : -1;
    tufts.push({ key: `tuft-${i}`, path: grassPath(x, y, g, lean) });
  }
  return tufts;
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  caption: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.lg,
    opacity: 0.8,
  },
});
