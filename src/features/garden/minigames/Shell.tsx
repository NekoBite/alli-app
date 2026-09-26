import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentType } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Button, Card, Pill, Screen, ScreenHeader, StatTile, Text } from '@/components';
import { colors, radius, spacing } from '@/theme';
import { MINIGAMES, PRACTICES } from '../rules';
import type { MinigameId } from '../types';
import type { GameProps } from './types';

type Phase = { kind: 'intro' } | { kind: 'playing'; deadline: number } | { kind: 'result'; success: boolean };

type Props = {
  game: MinigameId;
  Game: ComponentType<GameProps>;
  /** Called once on a win, before the screen closes. */
  onWon: () => Promise<void>;
};

/**
 * Everything a minigame shares: the intro, the timer bar, the result and the
 * lesson card. A game is only the field in the middle.
 */
export function MinigameShell({ game, Game, onWon }: Props) {
  const router = useRouter();
  const rule = MINIGAMES[game];
  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useSharedValue(1);

  const finish = (success: boolean) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPhase((current) => (current.kind === 'playing' ? { kind: 'result', success } : current));
  };

  const start = () => {
    const deadline = Date.now() + rule.durationMs;
    progress.value = 1;
    progress.value = withTiming(0, { duration: rule.durationMs, easing: Easing.linear });
    timer.current = setTimeout(() => finish(false), rule.durationMs);
    setPhase({ kind: 'playing', deadline });
  };

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const [secondsLeft, setSecondsLeft] = useState(Math.round(rule.durationMs / 1000));
  useEffect(() => {
    if (phase.kind !== 'playing') return;
    const deadline = phase.deadline;
    const t = setInterval(() => setSecondsLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000))), 250);
    return () => clearInterval(t);
  }, [phase]);

  const barStyle = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width: Math.round(width), height: Math.round(height) });
  };

  const done = async () => {
    if (phase.kind !== 'result') return;
    if (!phase.success) {
      router.back();
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onWon();
      router.back();
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reward = rule.grants.compost
    ? '+ compost for your heap'
    : rule.grants.practice
      ? `+1 practice · ${PRACTICES[rule.grants.practice].label}`
      : '—';

  return (
    <Screen
      scroll={false}
      footer={
        phase.kind === 'intro' ? (
          <Button label="Start round" onPress={start} />
        ) : phase.kind === 'result' ? (
          <View style={styles.actions}>
            {!phase.success ? (
              <Button label="Try again" variant="secondary" onPress={() => setPhase({ kind: 'intro' })} style={styles.action} />
            ) : null}
            <Button
              label={phase.success ? 'Collect' : 'Back'}
              loading={saving}
              onPress={() => void done()}
              style={styles.action}
            />
          </View>
        ) : (
          <Button label="Give up" variant="secondary" onPress={() => finish(false)} />
        )
      }
    >
      <ScreenHeader
        eyebrow={`Minigame · ${Math.round(rule.durationMs / 1000)} s`}
        title={rule.label}
        back
      />

      <View style={styles.stats}>
        <StatTile label="Time" value={phase.kind === 'playing' ? `0:${String(secondsLeft).padStart(2, '0')}` : `0:${String(Math.round(rule.durationMs / 1000)).padStart(2, '0')}`} color={colors.redHot} />
        <StatTile label="Status" value={phase.kind === 'result' ? (phase.success ? 'Won' : 'Lost') : phase.kind === 'playing' ? 'Live' : 'Ready'} />
      </View>

      <View style={styles.track}>
        <Animated.View style={[styles.fill, barStyle]} />
      </View>

      <View style={styles.field} onLayout={onLayout}>
        {phase.kind === 'playing' && size.width > 0 ? (
          <Game width={size.width} height={size.height} deadline={phase.deadline} onFinish={finish} />
        ) : null}

        {phase.kind === 'intro' ? (
          <View style={styles.overlay}>
            <Text variant="heading" center>
              {rule.label}
            </Text>
            <Text variant="body" color={colors.inkDim} center>
              {rule.blurb}
            </Text>
          </View>
        ) : null}

        {phase.kind === 'result' ? (
          <View style={styles.overlay}>
            <Pill
              label={phase.success ? 'Done' : 'Out of time'}
              color={phase.success ? colors.ok : colors.warn}
            />
            <Card style={styles.lesson} tone="muted">
              <Text variant="label" color={colors.ok}>
                Why it matters
              </Text>
              <Text variant="body">{rule.lesson}</Text>
            </Card>
            {saveError ? (
              <Text variant="caption" color={colors.danger} center>
                {saveError}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <Card tone="hero" style={styles.pays}>
        <Text variant="label" color={colors.redHot}>
          This round pays
        </Text>
        <Text variant="bodyStrong">{reward}</Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  pays: { gap: 6, marginTop: spacing.md },
  track: {
    height: 8,
    backgroundColor: colors.track,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginBottom: spacing.md,
  },
  fill: { height: '100%', backgroundColor: colors.redHot, borderRadius: radius.pill },
  field: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: 'rgba(10, 6, 5, 0.85)',
  },
  lesson: { gap: spacing.xs, width: '100%' },
  actions: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  action: { flex: 1 },
});
