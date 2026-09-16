import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Row, Screen, StatTile, Text } from '@/components';
import { explainFlag, pointsToAlli } from '@/features/jogging/rewards';
import { useJoggingStore } from '@/features/jogging/store';
import { colors, spacing } from '@/theme';
import {
  formatDistance,
  formatDuration,
  formatPace,
  formatPoints,
  formatToken,
} from '@/utils/format';
import { averageSpeed } from '@/features/jogging/geo';

export default function RunSummaryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const run = useJoggingStore((state) => state.history.find((item) => item.id === id));

  if (!run) {
    return (
      <Screen>
        <EmptyState
          title="Run not found"
          body="This run is no longer in your history."
          actionLabel="Back to runs"
          onAction={() => router.replace('/(tabs)/jog')}
        />
      </Screen>
    );
  }

  const { reward } = run;
  const counted = reward.points > 0;

  return (
    <Screen>
      <View style={styles.hero}>
        <Text variant="label" color={colors.ink2}>
          {counted ? 'Points earned' : 'No points earned'}
        </Text>
        <Text variant="hero" color={counted ? colors.green : colors.warning}>
          {formatPoints(reward.points)}
        </Text>
        {counted ? (
          <Text variant="caption" color={colors.ink2}>
            ≈ {formatToken(pointsToAlli(reward.points), 'ALLI')} once redeemed
          </Text>
        ) : null}
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

      <Card style={styles.card} tone="muted">
        <Text variant="heading">How this was calculated</Text>
        <Row label="Validated distance" value={`${formatDistance(reward.eligibleMetres)} km`} />
        <Row label="Base points" value={formatPoints(reward.basePoints)} />
        <Row label="Multiplier" value={`${reward.multiplier.toFixed(2)}×`} />
        <Row label="Before daily cap" value={formatPoints(reward.grossPoints)} />
        <Row label="Awarded" value={formatPoints(reward.points)} valueColor={colors.green} emphasis />
        <Row
          label="Server confirmed"
          value={run.confirmed ? 'Yes' : 'Pending'}
          valueColor={run.confirmed ? colors.green : colors.warning}
        />
      </Card>

      {reward.flags.length > 0 ? (
        <Card style={styles.card} tone="muted">
          <Text variant="heading" color={colors.warning}>
            Why this run was adjusted
          </Text>
          {reward.flags.map((flag) => (
            <Text key={flag} variant="body" color={colors.ink2}>
              • {explainFlag(flag)}
            </Text>
          ))}
        </Card>
      ) : null}

      <View style={styles.actions}>
        <Button label="Done" size="lg" onPress={() => router.replace('/(tabs)/jog')} />
        <Button
          label="Go to wallet"
          variant="secondary"
          onPress={() => router.replace('/(tabs)/wallet')}
        />
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
