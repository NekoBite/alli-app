import { Canvas } from '@shopify/react-native-skia';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

import { Text } from '@/components';
import { colors, spacing } from '@/theme';
import { MINIGAMES } from '../rules';
import { useClock, useDrag } from './hooks';
import {
  insidePile,
  insideRing,
  layoutMulch,
  MULCH_GOAL,
  placePiece,
  progressAt,
  type MulchPiece,
} from './mulchLogic';
import { MulchScene } from './MulchScene';
import type { GameProps } from './types';

/**
 * Mulch the roots. Drag straw from the pile onto the soil ring before the sun
 * is up. Nothing about the round is sent anywhere: a win grants the mulch
 * practice on the server, and that is all it needs to know.
 */
export function MulchGame({ width, height, deadline, onFinish }: GameProps) {
  const layout = useMemo(() => layoutMulch(width, height), [width, height]);
  const [pieces, setPieces] = useState<MulchPiece[]>([]);
  const done = pieces.length >= MULCH_GOAL;
  const now = useClock(4, !done);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragOpacity = useSharedValue(0);
  const dragTransform = useDerivedValue(() => [
    { translateX: dragX.value },
    { translateY: dragY.value },
  ]);

  const responder = useDrag<'straw'>({
    grab: (x, y) => {
      if (done || !insidePile(layout, x, y)) return null;
      dragX.set(x);
      dragY.set(y);
      dragOpacity.set(1);
      return 'straw';
    },
    move: (_held, x, y) => {
      dragX.set(x);
      dragY.set(y);
    },
    release: (_held, x, y) => {
      dragOpacity.set(0);
      if (!insideRing(layout, x, y)) return;
      setPieces((current) => {
        const next = placePiece(current, x, y);
        if (next.length >= MULCH_GOAL) onFinish(true);
        return next;
      });
    },
  });

  // Before the first tick the clock reads 0, which is dawn: the right start.
  const progress = now === 0 ? 0 : progressAt(now, deadline, MINIGAMES.mulch.durationMs);

  return (
    <View style={{ width, height }} {...responder}>
      <Canvas style={{ width, height }} pointerEvents="none">
        <MulchScene
          layout={layout}
          progress={progress}
          pieces={pieces}
          drag={{ transform: dragTransform, opacity: dragOpacity }}
        />
      </Canvas>
      <View pointerEvents="none" style={styles.score}>
        <Text variant="bodyStrong" color={colors.bg}>
          {Math.min(pieces.length, MULCH_GOAL)} / {MULCH_GOAL} covered
        </Text>
        <Text variant="caption" color={colors.bg}>
          Drag straw from the pile onto the roots
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  score: { position: 'absolute', top: spacing.sm, left: spacing.md, gap: 2 },
});
