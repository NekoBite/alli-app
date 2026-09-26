import { Canvas, Circle, Group, Oval, Paint, Rect, RoundedRect } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Text } from '@/components';
import { colors, radius, spacing } from '@/theme';
import { OUTLINE } from '../scene/palette';
import { hash, rand } from '../scene/stage';
import type { GameProps } from './types';

type Kind = 'leaf' | 'husk' | 'dropping';
type Item = { id: number; kind: Kind; x: number; y: number; bornAt: number };

/** Waste to collect before the heap can be turned. */
export const COMPOST_GOAL = 12;
const ITEM_LIFE_MS = 2_600;
const SPAWN_MS = 650;
const ITEM_R = 22;
const HOLD_MS = 1_500;

const KINDS: Kind[] = ['leaf', 'husk', 'dropping', 'leaf'];

/**
 * Gather compost. Farm waste scatters across the field and blows away after a
 * moment; tap it to collect it. Once the heap is big enough, hold to turn it.
 * The score is not sent anywhere: a win starts a heap maturing on the server,
 * and that is all the server needs to know.
 */
export function CompostGame({ width, height, deadline, onFinish }: GameProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [collected, setCollected] = useState(0);
  const [turning, setTurning] = useState(false);
  const nextId = useRef(1);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hold = useSharedValue(0);

  const field = { top: 16, bottom: height - 70, left: 20, right: width - 20 };

  useEffect(() => {
    if (turning) return;
    const spawn = setInterval(() => {
      const now = Date.now();
      setItems((current) => {
        const alive = current.filter((item) => item.bornAt + ITEM_LIFE_MS > now);
        if (now >= deadline) return alive;
        const id = nextId.current;
        nextId.current += 1;
        const seed = hash(`item-${id}-${now}`);
        return [
          ...alive,
          {
            id,
            kind: KINDS[Math.floor(rand(seed, 1) * KINDS.length)]!,
            x: field.left + rand(seed, 2) * (field.right - field.left),
            y: field.top + rand(seed, 3) * (field.bottom - field.top),
            bornAt: now,
          },
        ];
      });
    }, SPAWN_MS);
    return () => clearInterval(spawn);
  }, [turning, deadline, field.left, field.right, field.top, field.bottom]);

  const onPress = (x: number, y: number) => {
    if (turning) return;
    const hit = items.find((item) => (item.x - x) ** 2 + (item.y - y) ** 2 <= (ITEM_R * 1.4) ** 2);
    if (!hit) return;
    setItems((current) => current.filter((item) => item.id !== hit.id));
    setCollected((count) => {
      const next = count + 1;
      if (next >= COMPOST_GOAL) setTurning(true);
      return next;
    });
  };

  const startHold = () => {
    hold.value = withTiming(1, { duration: HOLD_MS });
    holdTimer.current = setTimeout(() => onFinish(true), HOLD_MS);
  };
  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    hold.value = withTiming(0, { duration: 200 });
  };
  const holdStyle = useAnimatedStyle(() => ({ width: `${hold.value * 100}%` }));

  const heapR = 18 + collected * 3;

  return (
    <View style={{ width, height }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Field"
        onPress={(event) => onPress(event.nativeEvent.locationX, event.nativeEvent.locationY)}
        style={StyleSheet.absoluteFill}
      >
        <Canvas style={{ width, height }} pointerEvents="none">
          <Rect x={0} y={0} width={width} height={height} color="#7FB069" />
          <Rect x={0} y={field.bottom} width={width} height={height - field.bottom} color="#8B6B3E" />
          <Circle cx={width / 2} cy={height - 30} r={heapR} color="#5C3D1E">
            <Paint color="#5C3D1E" />
            <Paint color={OUTLINE} style="stroke" strokeWidth={2} />
          </Circle>
          {items.map((item) => (
            <ItemSprite key={item.id} item={item} />
          ))}
        </Canvas>
      </Pressable>

      <View pointerEvents="none" style={styles.score}>
        <Text variant="bodyStrong" color={colors.bg}>
          {Math.min(collected, COMPOST_GOAL)} / {COMPOST_GOAL} gathered
        </Text>
      </View>

      {turning ? (
        <View style={styles.turn}>
          <Text variant="bodyStrong" color={colors.ink} center>
            Heap is big enough. Hold to turn it.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hold to turn the heap"
            onPressIn={startHold}
            onPressOut={endHold}
            style={styles.holdButton}
          >
            <Animated.View style={[styles.holdFill, holdStyle]} />
            <Text variant="bodyStrong" color={colors.onRed}>
              Hold to turn
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ItemSprite({ item }: { item: Item }) {
  const { x, y } = item;
  if (item.kind === 'leaf') {
    return (
      <Group transform={[{ rotate: 0.5 }]} origin={{ x, y }}>
        <Oval x={x - 16} y={y - 8} width={32} height={16}>
          <Paint color="#A67C2E" />
          <Paint color={OUTLINE} style="stroke" strokeWidth={2} />
        </Oval>
      </Group>
    );
  }
  if (item.kind === 'husk') {
    return (
      <RoundedRect x={x - 12} y={y - 16} width={24} height={32} r={8}>
        <Paint color="#E7CF50" />
        <Paint color={OUTLINE} style="stroke" strokeWidth={2} />
      </RoundedRect>
    );
  }
  return (
    <Circle cx={x} cy={y} r={12}>
      <Paint color="#6B4423" />
      <Paint color={OUTLINE} style="stroke" strokeWidth={2} />
    </Circle>
  );
}

const styles = StyleSheet.create({
  score: { position: 'absolute', top: spacing.sm, left: spacing.md },
  turn: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  holdButton: {
    width: '100%',
    minHeight: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.redDeep,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  holdFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.redHot,
  },
});
