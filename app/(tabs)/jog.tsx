import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Pill, Row, Screen, StatTile, Text } from '@/components';
import { useJoggingStore } from '@/features/jogging/store';
import { pointsToAlli, REWARD_RULES } from '@/features/jogging/rewards';
import type { JogSummary } from '@/features/jogging/types';
import { colors, spacing } from '@/theme';
import { formatDistance, formatDuration, formatPoints, formatToken } from '@/utils/format';
import { relativeTime } from '@/utils/time';

export default function JogScreen() {
  const router = useRouter();
  const { history, pointsBalance, redeeming, redeemPoints, refresh, loading } = useJoggingStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const redeemable = Math.floor(pointsBalance / REWARD_RULES.pointsPerAlli) *
    REWARD_RULES.pointsPerAlli;

  return (
    <Screen scroll={false}>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={refresh}
        ListHeaderComponent={
          <View style={styles.header}>
            <Card style={styles.card}>
              <Text variant="label" color={colors.ink2}>
                Points balance
              </Text>
              <Text variant="title" color={colors.green}>
                {formatPoints(pointsBalance)}
              </Text>
              <Text variant="caption" color={colors.ink2}>
                {redeemable > 0
                  ? `Redeem ${formatPoints(redeemable)} points for ${formatToken(pointsToAlli(redeemable), 'ALLI')}`
                  : `Earn ${formatPoints(REWARD_RULES.pointsPerAlli - pointsBalance)} more points to redeem 1 ALLI`}
              </Text>
              <Button
                label="Redeem for ALLI"
                variant="secondary"
                disabled={redeemable <= 0}
                loading={redeeming}
                onPress={() => void redeemPoints(redeemable)}
              />
            </Card>

            <Button label="Start a run" size="lg" onPress={() => router.push('/jog/active')} />

            <Text variant="heading" style={styles.sectionTitle}>
              Recent runs
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No runs yet"
            body="Your finished runs show up here with the points they earned and why."
          />
        }
        renderItem={({ item }) => <RunRow run={item} />}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

function RunRow({ run }: { run: JogSummary }) {
  const rejected = run.reward.points === 0;

  return (
    <Card style={styles.runCard} tone={rejected ? 'muted' : 'default'}>
      <View style={styles.runHead}>
        <Text variant="caption" color={colors.ink2}>
          {relativeTime(run.startedAt)}
        </Text>
        {rejected ? (
          <Pill label="Not counted" color={colors.warning} />
        ) : (
          <Pill label={`+${formatPoints(run.reward.points)} pts`} color={colors.green} />
        )}
      </View>

      <View style={styles.runStats}>
        <StatTile label="Distance" value={formatDistance(run.distanceMetres)} unit="km" />
        <StatTile label="Moving" value={formatDuration(run.movingSeconds)} />
        <StatTile
          label="Multiplier"
          value={`${run.reward.multiplier.toFixed(2)}×`}
          color={colors.cyan}
        />
      </View>

      {run.reward.flags.length > 0 ? (
        <Row label="Flags" value={run.reward.flags.join(', ')} valueColor={colors.warning} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.xxl, gap: spacing.md },
  header: { gap: spacing.lg, paddingTop: spacing.lg },
  card: { gap: spacing.sm },
  sectionTitle: { marginTop: spacing.sm },
  runCard: { gap: spacing.md },
  runHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  runStats: { flexDirection: 'row', gap: spacing.md },
});
