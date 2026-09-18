import { Canvas, Circle, Group, Path, Rect } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from '@/components';
import { colors, radius, spacing } from '@/theme';
import type { PlotView } from '../types';
import { hitTest, layoutScene, paintOrder, rand, type PlantPlacement } from './layout';
import { PALETTES, seasonFor, type Season } from './palette';
import { grassPath } from './shapes';
import { Sapling, Seedling, Sprout, Tree } from './sprites';

type Props = {
  plots: PlotView[];
  /** Defaults to the current meteorological season. */
  season?: Season;
  height?: number;
  /** Tap on a plant. */
  onPressPlant?: (plot: PlotView) => void;
  /** Tap on open ground — the sketch plants here; we open the seed shop. */
  onPressGround?: () => void;
};

const DEFAULT_HEIGHT = 240;
/** Matches `easeOutBack` in the sketch. */
const POP = Easing.out(Easing.back(1.70158));

/**
 * The garden as a scene rather than a list: a Skia canvas showing every plot
 * as a plant at the growth stage the store says it is at. State stays in the
 * store — this component only draws it.
 */
export function GardenScene({
  plots,
  season = seasonFor(),
  height = DEFAULT_HEIGHT,
  onPressPlant,
  onPressGround,
}: Props) {
  const [width, setWidth] = useState(0);
  const palette = PALETTES[season];
  const layout = useMemo(() => layoutScene(plots, width, height), [plots, width, height]);
  const plants = useMemo(() => paintOrder(layout), [layout]);
  const tufts = useMemo(() => grassTufts(width, layout.horizon, height), [width, layout.horizon, height]);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  };

  const onPress = (x: number, y: number) => {
    const hit = hitTest(layout, x, y);
    if (hit) onPressPlant?.(hit.view);
    else if (y >= layout.horizon) onPressGround?.();
  };

  return (
    <View style={[styles.frame, { height }]} onLayout={onLayout}>
      {width > 0 ? (
        <Pressable
          accessibilityRole="image"
          accessibilityLabel={`${palette.title}, ${plots.length} ${plots.length === 1 ? 'plant' : 'plants'}`}
          onPress={(event) => onPress(event.nativeEvent.locationX, event.nativeEvent.locationY)}
          style={StyleSheet.absoluteFill}
        >
          <Canvas style={{ width, height }} pointerEvents="none">
            <Rect x={0} y={0} width={width} height={height} color={palette.sky} />
            <Circle cx={layout.sun.x} cy={layout.sun.y} r={layout.sun.r} color={palette.sun} />
            <Rect x={0} y={layout.horizon} width={width} height={height - layout.horizon} color={palette.ground} />
            {tufts.map((tuft) => (
              <Path key={tuft.key} path={tuft.path} color={palette.grass} />
            ))}
            {plants.map((plant) => (
              <Plant key={plant.id} plant={plant} season={season} />
            ))}
          </Canvas>
        </Pressable>
      ) : null}

      <View pointerEvents="none" style={styles.caption}>
        <Text variant="label" color={season === 'winter' ? colors.bg : colors.ink}>
          {palette.title}
        </Text>
      </View>
    </View>
  );
}

function Plant({ plant, season }: { plant: PlantPlacement; season: Season }) {
  const palette = PALETTES[season];
  const pop = useSharedValue(0);

  useEffect(() => {
    pop.value = withTiming(1, { duration: 700, easing: POP });
  }, [pop]);

  const transform = useDerivedValue(() => [
    { translateX: plant.x },
    { translateY: plant.y },
    { scale: plant.scale * pop.value },
  ]);

  const { visual } = plant;
  return (
    <Group transform={transform}>
      {visual.form === 'seed' ? (
        <Seedling palette={palette} season={season} />
      ) : visual.form === 'sprout' ? (
        <Sprout palette={palette} season={season} petal={plant.petal} />
      ) : visual.form === 'sapling' ? (
        <Sapling palette={palette} season={season} />
      ) : (
        <Tree palette={palette} season={season} visual={visual} starPoints={plant.starPoints} />
      )}
    </Group>
  );
}

/** Decorative grass along the horizon. Deterministic, so it does not shimmer on re-render. */
function grassTufts(width: number, horizon: number, height: number) {
  if (width <= 0) return [];
  const count = Math.max(6, Math.round(width / 28));
  const tufts: { key: string; path: string }[] = [];
  for (let i = 0; i < count; i += 1) {
    const x = ((i + 0.5) / count) * width + (rand(i, 11) - 0.5) * 12;
    const y = horizon + 4 + rand(i, 12) * (height - horizon) * 0.5;
    const g = 0.5 + rand(i, 13) * 0.5;
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
