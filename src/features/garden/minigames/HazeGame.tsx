import { Canvas } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

import { Text } from '@/components';
import { colors, radius, spacing } from '@/theme';
import {
  EMBER_SPAWN_MS,
  escaped,
  HAZE_PER_ESCAPE,
  HAZE_PILES,
  hitEmber,
  hitPile,
  inBale,
  layoutHaze,
  pilePositions,
  spawnEmber,
  type Ember,
  type Pile,
} from './hazeLogic';
import { HazeScene } from './HazeScene';
import { useDrag } from './hooks';
import type { GameProps } from './types';

type Held = { kind: 'ember'; id: number } | { kind: 'pile'; id: number };

const TICK_MS = 80;

/**
 * Haze control. Embers drift in from the left: tap them out before they cross
 * the field, or the haze thickens. Drag every residue pile into the bale on
 * the right before the clock runs out. A win takes the no-burn pledge on the
 * server; the round itself is not reported.
 */
export function HazeGame({ width, height, deadline, onFinish }: GameProps) {
  const layout = useMemo(() => layoutHaze(width, height), [width, height]);
  const [piles, setPiles] = useState<Pile[]>(() => pilePositions(layout));
  const [heldPile, setHeldPile] = useState<number | null>(null);
  const [baled, setBaled] = useState(0);
  const [embers, setEmbers] = useState<Ember[]>([]);
  const [haze, setHaze] = useState(0);
  const [now, setNow] = useState(0);
  const nextEmber = useRef(1);
  const lastSpawn = useRef(0);
  const over = baled >= HAZE_PILES || haze >= 1;

  // The clock: embers drift, escape and spawn on a fixed tick.
  useEffect(() => {
    if (over) return;
    const timer = setInterval(() => {
      const at = Date.now();
      setNow(at);
      setEmbers((current) => {
        const gone = current.filter((ember) => escaped(ember, layout, at));
        if (gone.length > 0) setHaze((h) => Math.min(1, h + gone.length * HAZE_PER_ESCAPE));
        let next = current.filter((ember) => !escaped(ember, layout, at));
        if (lastSpawn.current === 0) lastSpawn.current = at;
        if (at < deadline && at - lastSpawn.current >= EMBER_SPAWN_MS) {
          lastSpawn.current = at;
          next = [...next, spawnEmber(nextEmber.current, layout, at)];
          nextEmber.current += 1;
        }
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [layout, deadline, over]);

  useEffect(() => {
    if (haze >= 1) onFinish(false);
  }, [haze, onFinish]);

  useEffect(() => {
    if (baled >= HAZE_PILES) onFinish(true);
  }, [baled, onFinish]);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const dragOpacity = useSharedValue(0);
  const dragTransform = useDerivedValue(() => [
    { translateX: dragX.value },
    { translateY: dragY.value },
  ]);

  const responder = useDrag<Held>({
    grab: (x, y) => {
      if (over) return null;
      const ember = hitEmber(embers, Date.now(), x, y);
      if (ember) return { kind: 'ember', id: ember.id };
      const pile = hitPile(piles, x, y);
      if (!pile) return null;
      dragX.set(x);
      dragY.set(y);
      dragOpacity.set(1);
      setHeldPile(pile.id);
      return { kind: 'pile', id: pile.id };
    },
    move: (held, x, y) => {
      if (held.kind !== 'pile') return;
      dragX.set(x);
      dragY.set(y);
    },
    release: (held, x, y) => {
      if (held.kind === 'ember') {
        setEmbers((current) => current.filter((ember) => ember.id !== held.id));
        return;
      }
      dragOpacity.set(0);
      setHeldPile(null);
      if (inBale(layout, x, y)) {
        setPiles((current) => current.filter((pile) => pile.id !== held.id));
        setBaled((count) => count + 1);
      }
    },
  });

  const visiblePiles = heldPile === null ? piles : piles.filter((pile) => pile.id !== heldPile);
  const hazePct = Math.round(haze * 100);

  return (
    <View style={{ width, height }} {...responder}>
      <Canvas style={{ width, height }} pointerEvents="none">
        <HazeScene
          layout={layout}
          now={now}
          piles={visiblePiles}
          embers={embers}
          baled={baled}
          haze={haze}
          drag={{ transform: dragTransform, opacity: dragOpacity }}
        />
      </Canvas>

      <View pointerEvents="none" style={styles.hud}>
        <View style={styles.row}>
          <Text variant="bodyStrong" color={colors.ink}>
            Baled {baled} / {HAZE_PILES}
          </Text>
          <Text variant="bodyStrong" color={haze > 0.6 ? colors.danger : colors.ink}>
            Haze {hazePct}%
          </Text>
        </View>
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${hazePct}%`, backgroundColor: haze > 0.6 ? colors.danger : colors.warning },
            ]}
          />
        </View>
        <Text variant="caption" color={colors.ink}>
          Tap embers out · drag piles into the bale
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hud: { position: 'absolute', top: spacing.sm, left: spacing.md, right: spacing.md, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  track: {
    height: 6,
    backgroundColor: 'rgba(10, 15, 13, 0.4)',
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
});
