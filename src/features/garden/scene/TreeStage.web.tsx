import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components';
import { colors, radius, spacing } from '@/theme';
import type { PlotView } from '../types';
import { PALETTES, seasonFor, type Season } from './palette';
import type { SparkleSpot } from './stage';

type Props = {
  view: PlotView;
  season?: Season;
  height?: number;
  popped?: number;
  onTapTree?: () => void;
  onTapSparkle?: (spot: SparkleSpot) => void;
};

/**
 * Web build of the stage. Skia on web needs CanvasKit loaded before the first
 * render (LoadSkiaWeb), which `npm run web` does not do yet; until it does,
 * the web tab shows the tree's state in words and still takes the taps.
 */
export function TreeStage({ view, season = seasonFor(), height = 200, popped = 0, onTapTree, onTapSparkle }: Props) {
  const palette = PALETTES[season];
  const sparkles = Math.max(0, view.sparkles - popped);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        sparkles > 0
          ? onTapSparkle?.({ index: 0, x: 0, y: 0, r: 0 })
          : onTapTree?.()
      }
      style={[styles.frame, { height, backgroundColor: palette.sky }]}
    >
      <Text variant="heading" color={colors.bg}>
        {view.seed.name} · {view.health}
      </Text>
      <Text variant="caption" color={colors.bg}>
        {sparkles > 0 ? `${sparkles} sparkles waiting, tap to collect` : 'Tap to give it sun'} · the scene
        renders on iOS and Android
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    borderRadius: radius.lg,
    padding: spacing.lg,
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
});
