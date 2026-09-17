import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Pill, ProgressBar, Row, Screen, StatTile, Text } from '@/components';
import { averageSpeed } from '@/features/run/geo';
import { explainFlag, questProgress, starsToAlli } from '@/features/run/rewards';
import { useRunStore } from '@/features/run/store';
import { colors, spacing } from '@/theme';
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatPoints,
  formatToken,
} from '@/utils/format';

export default function RunSummaryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const run = useRunStore((state) => state.history.find((item) => item.id === id));

  if (!run) {
    return (
      <Screen>
        <EmptyState
          title="Run not found"
          body="This run is no longer in your history."
          actionLabel="Back to runs"
          onAction={() => router.replace('/(tabs)/run')}
        />
      </Screen>
    );
  }

  const { reward } = run;
  const counted = reward.eligibleSteps > 0;

  return (
    <Screen>
      <View style={styles.hero}>
        <Text variant="label" color={colors.ink2}>
          {counted ? 'Steps counted' : 'No steps counted'}
        </Text>
        <Text variant="hero" color={counted ? colors.green : colors.warning}>
          {formatPoints(reward.eligibleSteps)}
        </Text>
        {reward.stars > 0 ? (
          <Pill
            label={`Quest complete · +${reward.stars} ★ · ${formatToken(starsToAlli(reward.stars), 'ALLI')}`}
            color={colors.gold}
          />
        ) : (
          <Text variant="caption" color={colors.ink2}>
            {formatPoints(reward.stepsToday)} of {formatPoints(reward.questGoal)} steps today
          </Text>
        )}
      </View>

      <Card style={styles.card}>
        <View style={styles.stats}>
          <StatTile label="Distance" value={formatDistance(run.distanceMetres)} unit="km" />
          <StatTile label="Moving" value={formatDuration(run.movingSeconds)} />
          <StatTile
            label="Pace"
            value={formatPace(averageSpeed(run.distanceMetres, run.movingSeconds))}
            unit="/km"
          />
        </View>
      </Card>

      <Card style={styles.card} tone={reward.questPaid ? 'premium' : 'muted'}>
        <Text variant="heading">
          {reward.questCompleted ? "Today's quest" : 'Quest progress'}
        </Text>
        <ProgressBar
          progress={questProgress(reward.stepsToday)}
          color={reward.questCompleted ? colors.green : colors.cyan}
        />
        <Row label="Steps this run" value={formatPoints(reward.eligibleSteps)} />
        <Row label="Steps today" value={formatPoints(reward.stepsToday)} />
        <Row label="Quest goal" value={formatPoints(reward.questGoal)} />
        <Text variant="caption" color={colors.ink2}>
          {reward.questPaid
            ? 'This run carried the day over the line. Only steps backed by GPS movement counted.'
            : reward.questCompleted
              ? "Today's quest was already paid. These steps bank towards the streak."
              : `${formatPoints(Math.max(0, reward.questGoal - reward.stepsToday))} GPS-verified steps left today.`}
        </Text>
      </Card>

      <Card style={styles.card} tone="muted">
        <Text variant="heading">How this was calculated</Text>
        <Row label="Steps that counted" value={formatPoints(reward.eligibleSteps)} />
        <Row label="Validated distance" value={`${formatDistance(reward.eligibleMetres)} km`} />
        <Row
          label="Quest reward"
          value={`${reward.baseStars} ★`}
          valueColor={reward.baseStars > 0 ? colors.gold : colors.ink2}
        />
        <Row label="Shoe multiplier" value={`${reward.shoeMultiplier}×`} />
        <Row
          label="Stars awarded"
          value={reward.stars.toString()}
          valueColor={reward.stars > 0 ? colors.gold : colors.ink2}
          emphasis
        />
        <Row
          label="Server confirmed"
          value={run.confirmed ? 'Yes' : 'Pending'}
          valueColor={run.confirmed ? colors.green : colors.warning}
        />
      </Card>

      {reward.flags.length > 0 ? (
        <Card style={styles.card} tone="muted">
          <Text variant="heading" color={colors.warning}>
            Why this run did not count
          </Text>
          {reward.flags.map((flag) => (
            <Text key={flag} variant="body" color={colors.ink2}>
              • {explainFlag(flag)}
            </Text>
          ))}
        </Card>
      ) : null}

      <View style={styles.actions}>
        <Button label="Done" size="lg" onPress={() => router.replace('/(tabs)/run')} />
        {reward.stars > 0 ? (
          <Button
            label="Exchange stars"
            variant="secondary"
            onPress={() => router.replace('/run/stars')}
          />
        ) : (
          <Button
            label="Go to wallet"
            variant="secondary"
            onPress={() => router.replace('/(tabs)/wallet')}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.xs },
  card: { gap: spacing.sm, marginBottom: spacing.lg },
  stats: { flexDirection: 'row', gap: spacing.md },
  actions: { gap: spacing.md },
});
