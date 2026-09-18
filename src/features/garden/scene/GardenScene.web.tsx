import { StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { colors, radius, spacing } from '@/theme';
import type { PlotView } from '../types';
import { PALETTES, seasonFor, type Season } from './palette';

type Props = {
  plots: PlotView[];
  season?: Season;
  height?: number;
  onPressPlant?: (plot: PlotView) => void;
  onPressGround?: () => void;
};

/**
 * Web build of the scene. Skia on web needs CanvasKit loaded before the
 * first render (LoadSkiaWeb), which `npm run web` does not do yet; until it
 * does, the web tab shows the season and the count and leaves the drawing to
 * the native apps.
 */
export function GardenScene({ plots, season = seasonFor(), height = 120 }: Props) {
  const palette = PALETTES[season];
  return (
    <View style={[styles.frame, { height, backgroundColor: palette.sky }]}>
      <Text variant="heading" color={colors.bg}>
        {palette.title}
      </Text>
      <Text variant="caption" color={colors.bg}>
        {plots.length} {plots.length === 1 ? 'plant' : 'plants'} · the scene renders on iOS and Android
      </Text>
    </View>
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
