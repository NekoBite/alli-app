import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Card, Pill, ProgressBar, Row, Screen, StatTile, Text } from '@/components';
import { questProgress, REWARD_RULES, starsToAlli } from '@/features/run/rewards';
import { useRunStore } from '@/features/run/store';
import { useRunSession } from '@/features/run/useRunSession';
import type { RunSession } from '@/features/run/types';
import { colors, spacing } from '@/theme';
import {
  formatDistance,
  formatDuration,
  formatPoints,
  formatSpeedKmh,
  formatToken,
} from '@/utils/format';

export default function ActiveRunScreen() {
  const router = useRouter();
  const session = useRunSession();
  const { previewReward, submitRun } = useRunStore();
  const [submitting, setSubmitting] = useState(false);

  const preview = previewReward(
    {
      distanceMetres: session.distanceMetres,
      movingSeconds: session.movingSeconds,
      track: session.track,
      steps: session.steps,
    },
    session.rejectedPoints,
  );

  const progress = questProgress(preview.stepsToday);

  const finish = useCallback(async () => {
    session.finish();
    setSubmitting(true);

    const record: RunSession = {
      id: session.id || `run-${Date.now()}`,
      startedAt: session.startedAt || Date.now() - session.elapsedSeconds * 1000,
      endedAt: Date.now(),
      track: session.track,
      distanceMetres: session.distanceMetres,
      movingSeconds: session.movingSeconds,
      steps: session.steps,
      stepSamples: session.stepSamples,
    };

    try {
      const summary = await submitRun(record, session.rejectedPoints);
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

  return (
    <Screen>
      <Card style={styles.card} tone="muted">
        <Text variant="caption" color={colors.warning}>
          Keep the screen on and run outdoors — steps only count where GPS movement backs them up,
          so shaking the phone does nothing. Your progress is saved automatically, so you can stop
          and pick the run up later.
        </Text>
      </Card>

      {session.resumedFromDraft && session.status === 'paused' ? (
        <Card style={styles.card}>
          <Row
            label="Unfinished run"
            value={`${formatDistance(session.distanceMetres)} km · ${formatDuration(session.elapsedSeconds)}`}
            valueColor={colors.cyan}
            emphasis
          />
          <Text variant="caption" color={colors.ink2}>
            Picked up where you left off. Resume to keep recording, or discard it and start fresh.
          </Text>
        </Card>
      ) : null}

      <View style={styles.metrics}>
        <Text variant="label" color={colors.ink2}>
          Steps · GPS
        </Text>
        <View style={styles.metricRow}>
          <Text variant="metric" color={colors.green}>
            {formatPoints(session.steps)}
          </Text>
          <Text variant="heading" color={colors.ink2}>
            steps
          </Text>
        </View>
      </View>

      <Card style={styles.card}>
        <View style={styles.stats}>
          <StatTile label="Distance" value={formatDistance(session.distanceMetres)} unit="km" />
          <StatTile label="Time" value={formatDuration(session.elapsedSeconds)} />
        </View>
        <View style={styles.stats}>
          <StatTile label="Speed" value={formatSpeedKmh(session.speedMps)} unit="km/h" />
          <StatTile
            label="Steps today"
            value={formatPoints(preview.stepsToday)}
            color={preview.flags.length ? colors.warning : colors.green}
          />
        </View>
        <Text variant="caption" color={colors.ink3}>
          Everything here is an estimate. The server re-checks the run before any star is credited.
        </Text>
      </Card>

      <Card style={styles.card}>
        <Row
          label={`Today's quest · ${formatPoints(REWARD_RULES.dailyStepGoal)} steps`}
          value={`${Math.round(progress * 100)}%`}
          valueColor={preview.questCompleted ? colors.green : colors.ink}
          emphasis
        />
        <ProgressBar
          progress={progress}
          color={preview.questCompleted ? colors.green : colors.cyan}
        />
        <Text variant="caption" color={colors.ink2}>
          {preview.questPaid
            ? `Quest complete — this run pays ${preview.stars} star${preview.stars === 1 ? '' : 's'} (≈ ${formatToken(starsToAlli(preview.stars), 'ALLI')}) at your ${preview.shoeMultiplier}× tier.`
            : preview.questCompleted
              ? "Today's quest is already paid. These steps still bank towards your streak."
              : `${formatPoints(Math.max(0, REWARD_RULES.dailyStepGoal - preview.stepsToday))} GPS-verified steps to go today.`}
        </Text>
        {session.pedometer === 'unavailable' ? (
          <Text variant="caption" color={colors.warning}>
            No step counter on this device. Steps are what earn — without one this run records
            distance but adds nothing to the quest.
          </Text>
        ) : null}
      </Card>

      <Card style={styles.card} tone="muted">
        <Row
          label="GPS fixes"
          value={`${session.track.length} kept · ${session.rejectedPoints} dropped`}
          valueColor={session.rejectedPoints > session.track.length ? colors.warning : colors.ink2}
        />
        <Row
          label="Steps"
          value={`${formatPoints(session.steps)} counted · ${formatPoints(session.droppedSteps)} unbacked`}
          valueColor={session.droppedSteps > session.steps ? colors.warning : colors.ink2}
        />
        <Row label="Moving time" value={formatDuration(session.movingSeconds)} />
        {preview.flags.length > 0 ? (
          <View style={styles.flags}>
            {preview.flags.map((flag) => (
              <Pill key={flag} label={flag} color={colors.warning} />
            ))}
          </View>
        ) : null}
      </Card>

      {session.error ? (
        <Text variant="caption" color={colors.danger}>
          {session.error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        {session.status === 'idle' ? (
          <Button label="Start run" size="lg" onPress={() => void session.start()} />
        ) : null}

        {session.status === 'running' ? (
          <>
            <Button label="Pause" size="lg" variant="secondary" onPress={session.pause} />
            <Button label="Finish" size="lg" loading={submitting} onPress={() => void finish()} />
          </>
        ) : null}

        {session.status === 'paused' ? (
          <>
            <Button label="Resume" size="lg" onPress={() => void session.resume()} />
            <Button
              label="Finish"
              size="lg"
              variant="secondary"
              loading={submitting}
              onPress={() => void finish()}
            />
            <Button label="Discard" variant="danger" onPress={confirmDiscard} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.xs },
  metricRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  card: { gap: spacing.md, marginBottom: spacing.lg },
  stats: { flexDirection: 'row', gap: spacing.md },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { gap: spacing.md, marginTop: spacing.lg },
});
