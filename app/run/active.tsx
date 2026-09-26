import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Pill, Screen, Text } from '@/components';
import { GOAL_RULES, weekGoals } from '@/features/run/goals';
import { REWARD_RULES } from '@/features/run/rewards';
import { useRunStore } from '@/features/run/store';
import type { RunSession } from '@/features/run/types';
import { ActivityRings } from '@/features/run/ui/ActivityRings';
import { RouteMap } from '@/features/run/ui/RouteMap';
import { useRunSession } from '@/features/run/useRunSession';
import { colors, spacing } from '@/theme';
import { formatDistance, formatDuration, formatPace, formatPoints } from '@/utils/format';

/** 2.3 Live run — rings, the stat row, the route, and Pause / Finish. */
export default function ActiveRunScreen() {
  const router = useRouter();
  const session = useRunSession();
  const { previewReward, submitRun, history } = useRunStore();
  const [submitting, setSubmitting] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);

  const preview = previewReward(
    {
      distanceMetres: session.distanceMetres,
      movingSeconds: session.movingSeconds,
      track: session.track,
      steps: session.steps,
    },
    session.rejectedPoints,
  );
  const todayMoving = weekGoals(history).find((d) => d.isToday)?.movingSeconds ?? 0;
  const activeMinutes = (todayMoving + session.movingSeconds) / 60;

  // A ring completing pulses the phone once.
  const done = useRef({ steps: preview.stepsToday >= REWARD_RULES.dailyStepGoal, minutes: activeMinutes >= GOAL_RULES.activeMinutesGoal });
  useEffect(() => {
    const steps = preview.stepsToday >= REWARD_RULES.dailyStepGoal;
    const minutes = activeMinutes >= GOAL_RULES.activeMinutesGoal;
    if ((steps && !done.current.steps) || (minutes && !done.current.minutes)) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    }
    done.current = { steps, minutes };
  }, [preview.stepsToday, activeMinutes]);

  const finish = useCallback(async () => {
    setSubmitting(true);
    // Finishing collects whatever the background task buffered, so the run is
    // built from the snapshot it hands back rather than from this render.
    const final = await session.finish();

    const record: RunSession = {
      id: final.id || `run-${Date.now()}`,
      startedAt: final.startedAt || Date.now() - final.elapsedSeconds * 1000,
      endedAt: Date.now(),
      track: final.track,
      distanceMetres: final.distanceMetres,
      movingSeconds: final.movingSeconds,
      steps: final.steps,
      stepSamples: final.stepSamples,
    };

    try {
      const summary = await submitRun(record, final.rejectedPoints);
      router.replace({ pathname: '/run/summary', params: { id: summary.id } });
    } catch (error) {
      setSubmitting(false);
      Alert.alert('Could not save run', (error as Error).message);
    }
  }, [router, session, submitRun]);

  const confirmDiscard = () => {
    Alert.alert('Discard this run?', 'The distance you have covered will not be saved.', [
      { text: 'Keep running', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          session.reset();
          router.back();
        },
      },
    ]);
  };

  const live = session.status === 'running';
  const footer =
    session.status === 'idle' ? (
      <View style={styles.pair}>
        <Button label="Back" variant="secondary" onPress={() => router.back()} style={styles.flex} />
        <Button label="Start run" onPress={() => void session.start()} style={styles.flex} />
      </View>
    ) : (
      <>
        <View style={styles.pair}>
          {live ? (
            <Button label="Pause" variant="secondary" onPress={session.pause} style={styles.flex} />
          ) : (
            <Button label="Resume" variant="secondary" onPress={() => void session.resume()} style={styles.flex} />
          )}
          <Button
            label="Finish"
            loading={submitting}
            onPress={() => void finish()}
            onLongPress={confirmDiscard}
            style={styles.flex}
          />
        </View>
        <Text variant="caption" color={colors.inkFaint} center style={styles.hint}>
          Vehicle-speed segments are flagged and not counted. Long-press Finish to discard.
        </Text>
      </>
    );

  return (
    <Screen footer={footer}>
      <View style={styles.top}>
        <Pill
          kind="status"
          color={session.track.length > 0 ? colors.ok : colors.warn}
          label={session.track.length > 0 ? `GPS locked · ${session.track.length} fixes` : 'Waiting for GPS'}
        />
        {live ? <Pill label="● Rec" color={colors.redHot} filled /> : session.status === 'paused' ? <Pill label="Paused" color={colors.warn} /> : null}
      </View>

      {session.resumedFromDraft && session.status === 'paused' ? (
        <Card tone="warn" style={styles.notice}>
          <Text variant="caption" color={colors.inkDim}>
            Unfinished run restored: {formatDistance(session.distanceMetres)} km ·{' '}
            {formatDuration(session.elapsedSeconds)}. Resume to keep recording, or long-press Finish
            to discard it.
          </Text>
        </Card>
      ) : null}

      <View style={styles.rings}>
        <ActivityRings
          steps={preview.stepsToday}
          stepGoal={REWARD_RULES.dailyStepGoal}
          activeMinutes={activeMinutes}
          minuteGoal={GOAL_RULES.activeMinutesGoal}
        />
      </View>

      <View style={styles.stats}>
        <Stat value={formatDistance(session.distanceMetres)} label="km" />
        <Stat value={formatDuration(session.elapsedSeconds)} label="time" />
        <Stat value={formatPace(session.speedMps)} label="pace /km" />
      </View>

      <View style={styles.routeHead}>
        <Text variant="label" color={colors.inkFaint}>
          Route
        </Text>
        <Pressable accessibilityRole="button" onPress={() => setMapOpen((o) => !o)} hitSlop={8}>
          <Text variant="mono" color={colors.redHot}>
            {mapOpen ? 'Collapse ↙' : 'Expand ↗'}
          </Text>
        </Pressable>
      </View>
      <RouteMap track={session.track} height={mapOpen ? 320 : 110} />

      <Text variant="mono" color={colors.inkFaint} style={styles.meta}>
        {formatPoints(session.steps)} steps counted · {formatPoints(session.droppedSteps)} unbacked ·{' '}
        {session.rejectedPoints} fixes dropped
      </Text>
      {session.status !== 'idle' && preview.flags.length > 0 ? (
        <View style={styles.flags}>
          {preview.flags.map((flag) => (
            <Pill key={flag} label={flag} color={colors.warn} />
          ))}
        </View>
      ) : null}
      {live && session.background !== 'started' ? (
        <Text variant="caption" color={colors.warn} style={styles.meta}>
          {session.background === 'denied'
            ? 'Background location is off, so this run stops when the screen locks. Allow it in Settings to record with the phone away.'
            : 'Keep the screen on — this build cannot record in the background.'}
        </Text>
      ) : null}
      {session.pedometer === 'unavailable' ? (
        <Text variant="caption" color={colors.warn} style={styles.meta}>
          No step counter on this device. Steps are what earn — this run records distance only.
        </Text>
      ) : null}
      {session.error ? (
        <Text variant="caption" color={colors.danger} style={styles.meta}>
          {session.error}
        </Text>
      ) : null}
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="heading" style={styles.statValue}>
        {value}
      </Text>
      <Text variant="mono" color={colors.inkFaint}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  notice: { marginTop: spacing.md },
  rings: { alignItems: 'center', marginVertical: spacing.xl },
  stats: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: spacing.xl },
  stat: { alignItems: 'center', gap: 2 },
  statValue: { fontSize: 26, lineHeight: 32 },
  routeHead: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', marginBottom: spacing.sm },
  meta: { marginTop: spacing.md },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  pair: { flexDirection: 'row', gap: 10 },
  hint: { fontSize: 11 },
});
