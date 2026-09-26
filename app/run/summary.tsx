import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  KeyValueCard,
  Pill,
  Screen,
  ScreenHeader,
  StatTile,
  Text,
} from '@/components';
import { averageSpeed } from '@/features/run/geo';
import { explainFlag } from '@/features/run/rewards';
import { useRunStore } from '@/features/run/store';
import { colors, fonts, spacing } from '@/theme';
import { formatDistance, formatDuration, formatPace, formatPoints, formatStars } from '@/utils/format';

/** 2.4 Run summary — the reward is only final once the server confirms the track. */
export default function RunSummaryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const run = useRunStore((state) => state.history.find((item) => item.id === id));
  const toToday = () => router.replace('/(tabs)');

  if (!run) {
    return (
      <Screen>
        <ScreenHeader title="Run summary" back={toToday} />
        <EmptyState
          title="Run not found"
          body="This run is no longer in your history."
          actionLabel="Back to Today"
          onAction={toToday}
        />
      </Screen>
    );
  }

  const { reward } = run;
  const ended = new Date(run.endedAt ?? run.startedAt);
  const time = `${String(ended.getHours()).padStart(2, '0')}:${String(ended.getMinutes()).padStart(2, '0')}`;
  const uncounted = Math.max(0, reward.steps - reward.eligibleSteps);

  return (
    <Screen
      footer={
        <View style={styles.pair}>
          <Button
            label="Exchange stars"
            variant="secondary"
            onPress={() => router.replace('/run/stars')}
            style={styles.flex}
          />
          <Button label="Done" onPress={toToday} style={styles.flex} />
        </View>
      }
    >
      <ScreenHeader eyebrow={`Today · ${time}`} title="Run complete" back={() => router.replace('/(tabs)/run')} />

      <Card tone="hero" style={styles.hero}>
        <Text variant="label" color={colors.redHot} center>
          {reward.questPaid ? 'Stars awarded' : 'Steps counted'}
        </Text>
        <Text style={styles.big} center>
          {reward.questPaid ? `+${formatStars(reward.stars)} ★` : formatPoints(reward.eligibleSteps)}
        </Text>
        <Pill
          label={run.confirmed ? 'Server confirmed' : 'Awaiting server'}
          color={run.confirmed ? colors.ok : colors.warn}
          style={styles.badge}
        />
      </Card>

      <View style={styles.stats}>
        <StatTile label="Distance" value={`${formatDistance(run.distanceMetres)} km`} />
        <StatTile label="Moving" value={formatDuration(run.movingSeconds)} />
        <StatTile label="Pace" value={formatPace(averageSpeed(run.distanceMetres, run.movingSeconds))} />
      </View>

      <KeyValueCard
        title="How this was calculated"
        lines={[
          { label: 'Steps that counted', value: formatPoints(reward.eligibleSteps) },
          { label: 'Validated distance', value: `${formatDistance(reward.eligibleMetres)} km` },
          { label: 'Steps today', value: `${formatPoints(reward.stepsToday)} / ${formatPoints(reward.questGoal)}` },
          { label: 'Quest reward', value: `${formatStars(reward.baseStars)} ★` },
          { label: 'Shoe multiplier', value: `×${reward.shoeMultiplier.toFixed(1)}` },
        ]}
        total={{ label: 'Stars awarded', value: `${formatStars(reward.stars)} ★` }}
      />

      {uncounted > 0 || reward.flags.length > 0 ? (
        <View style={styles.notes}>
          {uncounted > 0 ? (
            <Text variant="mono" color={colors.inkFaint}>
              {formatPoints(uncounted)} steps not counted — no GPS movement backed them.
            </Text>
          ) : null}
          {reward.flags.map((flag) => (
            <Text key={flag} variant="caption" color={colors.warn}>
              {explainFlag(flag)}
            </Text>
          ))}
        </View>
      ) : null}
      {!reward.questPaid && !reward.questCompleted ? (
        <Text variant="caption" color={colors.inkDim} style={styles.notes}>
          {formatPoints(Math.max(0, reward.questGoal - reward.stepsToday))} GPS-verified steps left
          before today’s quest pays.
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, marginBottom: 14 },
  big: { fontFamily: fonts.display, fontSize: 60, lineHeight: 72, color: colors.ink, letterSpacing: -1.2 },
  badge: { alignSelf: 'center' },
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: 14 },
  notes: { gap: spacing.xs, marginTop: spacing.md },
  pair: { flexDirection: 'row', gap: 10 },
});
