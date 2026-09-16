import { useCallback, useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Card, Pill, Row, Screen, StatTile, Text } from '@/components';
import { useJoggingStore } from '@/features/jogging/store';
import { useJogSession } from '@/features/jogging/useJogSession';
import type { JogSession } from '@/features/jogging/types';
import { colors, spacing } from '@/theme';
import { formatDistance, formatDuration, formatPace, formatPoints } from '@/utils/format';

export default function ActiveRunScreen() {
  const router = useRouter();
  const session = useJogSession();
  const { previewReward, submitRun } = useJoggingStore();
  const [submitting, setSubmitting] = useState(false);

  const preview = previewReward(
    {
      distanceMetres: session.distanceMetres,
      movingSeconds: session.movingSeconds,
      track: session.track,
    },
    session.rejectedPoints,
  );

  const finish = useCallback(async () => {
    session.finish();
    setSubmitting(true);

    const record: JogSession = {
      id: `run-${Date.now()}`,
      startedAt: Date.now() - session.elapsedSeconds * 1000,
      endedAt: Date.now(),
      track: session.track,
      distanceMetres: session.distanceMetres,
      movingSeconds: session.movingSeconds,
    };

    try {
      const summary = await submitRun(record, session.rejectedPoints);
      router.replace({ pathname: '/jog/summary', params: { id: summary.id } });
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
      <View style={styles.metrics}>
        <Text variant="label" color={colors.ink2}>
          Distance
        </Text>
        <View style={styles.metricRow}>
          <Text variant="metric" color={colors.green}>
            {formatDistance(session.distanceMetres)}
          </Text>
          <Text variant="heading" color={colors.ink2}>
            km
          </Text>
        </View>
      </View>

      <Card style={styles.card}>
        <View style={styles.stats}>
          <StatTile label="Time" value={formatDuration(session.elapsedSeconds)} />
          <StatTile label="Pace" value={formatPace(session.speedMps)} unit="/km" />
          <StatTile
            label="Points"
            value={formatPoints(preview.points)}
            color={preview.flags.length ? colors.warning : colors.green}
          />
        </View>
        <Text variant="caption" color={colors.ink3}>
          Points shown are an estimate. The server re-checks the run before any ALLI is credited.
        </Text>
      </Card>

      <Card style={styles.card} tone="muted">
        <Row
          label="GPS fixes"
          value={`${session.track.length} kept · ${session.rejectedPoints} dropped`}
          valueColor={session.rejectedPoints > session.track.length ? colors.warning : colors.ink2}
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
          <Button label="Start" size="lg" onPress={() => void session.start()} />
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
            <Button label="Finish" size="lg" variant="secondary" loading={submitting} onPress={() => void finish()} />
            <Button label="Discard" variant="danger" onPress={confirmDiscard} />
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  metrics: { paddingVertical: spacing.xxl, alignItems: 'center', gap: spacing.xs },
  metricRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  card: { gap: spacing.md, marginBottom: spacing.lg },
  stats: { flexDirection: 'row', gap: spacing.md },
  flags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actions: { gap: spacing.md, marginTop: spacing.lg },
});
