import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  Pill,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  StatTile,
  Text,
} from '@/components';
import { RUN_CREDIT_RULES, remainingPurchasableRuns } from '@/features/run/credits';
import { GOAL_RULES, weekGoals, weekTotals, type DayGoal } from '@/features/run/goals';
import { pointsToAlli, REWARD_RULES } from '@/features/run/rewards';
import { goalProgress } from '@/features/run/steps';
import { useRunStore } from '@/features/run/store';
import type { RunSummary } from '@/features/run/types';
import { useWalletStore } from '@/features/wallet/store';
import { colors, radius, spacing } from '@/theme';
import { formatDistance, formatDuration, formatPoints, formatToken } from '@/utils/format';
import { formatServerTime, relativeTime } from '@/utils/time';

export default function RunScreen() {
  const router = useRouter();
  const {
    history,
    pointsBalance,
    entitlement,
    entitlementError,
    redeeming,
    redeemPoints,
    refresh,
    loading,
    canStart,
  } = useRunStore();
  const account = useWalletStore((state) => state.account);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const redeemable =
    Math.floor(pointsBalance / REWARD_RULES.pointsPerAlli) * REWARD_RULES.pointsPerAlli;
  const start = canStart();
  const week = weekGoals(history);
  const totals = weekTotals(week);
  const buyableLeft = remainingPurchasableRuns(entitlement.extraRunsBoughtThisMonth);

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
              <View style={styles.rowBetween}>
                <Text variant="heading">Run balance</Text>
                <Pill
                  label={`${entitlement.runsLeft} run${entitlement.runsLeft === 1 ? '' : 's'} left`}
                  color={entitlement.runsLeft > 0 ? colors.green : colors.warning}
                  dot
                />
              </View>

              <View style={styles.stats}>
                <StatTile
                  label="Stars today"
                  value={entitlement.starsToday.toString()}
                  color={colors.gold}
                />
                <StatTile label="Runs this month" value={entitlement.runsThisMonth.toString()} />
                <StatTile
                  label="Runs left"
                  value={entitlement.runsLeft.toString()}
                  color={entitlement.runsLeft > 0 ? colors.ink : colors.warning}
                />
              </View>

              <Text variant="caption" color={colors.ink3}>
                Run credits never expire. Server time {formatServerTime(entitlement.serverTime)}.
              </Text>

              <Button
                label="Start a run"
                size="lg"
                disabled={!start.ok}
                onPress={() => router.push('/run/active')}
              />
              {start.reason ? (
                <Text variant="caption" color={colors.warning}>
                  {start.reason}
                </Text>
              ) : null}
              {entitlementError ? (
                <Text variant="caption" color={colors.ink3}>
                  Run credits could not be read ({entitlementError}). The server decides whether a
                  run is recorded.
                </Text>
              ) : null}
            </Card>

            <Card style={styles.card}>
              <Text variant="heading">Buy extra runs</Text>
              <Text variant="caption" color={colors.ink2}>
                {formatToken(RUN_CREDIT_RULES.extraRunPriceUsdt, 'USDT')} per run · bought{' '}
                {entitlement.extraRunsBoughtThisMonth}/{RUN_CREDIT_RULES.maxExtraRunsPerMonth} this
                month
              </Text>
              <Button
                label="Buy runs"
                variant="secondary"
                disabled={buyableLeft === 0}
                onPress={() => router.push('/run/credits')}
              />
            </Card>

            <Card style={styles.card} tone="premium">
              <View style={styles.rowBetween}>
                <Text variant="heading">Stars</Text>
                <Text variant="title" color={colors.gold}>
                  {entitlement.stars}
                </Text>
              </View>
              <Text variant="caption" color={colors.ink2}>
                One star per completed run · 1 star ={' '}
                {formatToken(REWARD_RULES.alliPerStar, 'ALLI')}
              </Text>
              <Button
                label="Exchange stars for ALLI"
                variant="secondary"
                disabled={entitlement.stars <= 0}
                onPress={() => router.push('/run/stars')}
              />
            </Card>

            <SectionHeader
              title="This week"
              subtitle={`${totals.goalDays} of ${GOAL_RULES.weekDays} days completed`}
            />
            <Card style={styles.card}>
              <View style={styles.week}>
                {week.map((day) => (
                  <DayColumn key={day.day} day={day} />
                ))}
              </View>
              <View style={styles.stats}>
                <StatTile label="Distance" value={formatDistance(totals.metres)} unit="km" />
                <StatTile
                  label="Move minutes"
                  value={Math.round(totals.movingSeconds / 60).toString()}
                />
                <StatTile label="Stars" value={totals.stars.toString()} color={colors.gold} />
              </View>
            </Card>

            <SectionHeader title="Points" subtitle={`${REWARD_RULES.pointsPerKm} per validated km`} />
            <Card style={styles.card}>
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
                // Redemption is an on-chain payout; without an address there
                // is nowhere for it to land.
                disabled={redeemable <= 0 || !account}
                loading={redeeming}
                onPress={() => account && void redeemPoints(redeemable, account.address)}
              />
            </Card>

            <Text variant="heading" style={styles.sectionTitle}>
              Recent runs
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No runs yet"
            body="Your finished runs show up here with the points and stars they earned, and why."
          />
        }
        renderItem={({ item }) => <RunRow run={item} />}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

/** One day in the week strip: a step-goal bar, its weekday, today picked out. */
function DayColumn({ day }: { day: DayGoal }) {
  return (
    <View style={styles.day}>
      <View style={styles.dayBar}>
        <ProgressBar
          progress={goalProgress(day.steps, GOAL_RULES.dailyStepGoal)}
          color={day.goalMet ? colors.green : colors.cyan}
          height={6}
        />
      </View>
      <Text variant="label" color={day.isToday ? colors.ink : colors.ink3}>
        {day.label}
      </Text>
    </View>
  );
}

function RunRow({ run }: { run: RunSummary }) {
  const rejected = run.reward.points === 0 && run.reward.stars === 0;

  return (
    <Card style={styles.runCard} tone={rejected ? 'muted' : 'default'}>
      <View style={styles.runHead}>
        <Text variant="caption" color={colors.ink2}>
          {relativeTime(run.startedAt)}
        </Text>
        <View style={styles.pills}>
          {run.reward.stars > 0 ? (
            <Pill label={`+${run.reward.stars} star`} color={colors.gold} />
          ) : null}
          {rejected ? (
            <Pill label="Not counted" color={colors.warning} />
          ) : (
            <Pill label={`+${formatPoints(run.reward.points)} pts`} color={colors.green} />
          )}
        </View>
      </View>

      <View style={styles.runStats}>
        <StatTile label="Distance" value={formatDistance(run.distanceMetres)} unit="km" />
        <StatTile label="Steps" value={formatPoints(run.reward.steps)} />
        <StatTile label="Moving" value={formatDuration(run.movingSeconds)} />
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
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stats: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xs },
  week: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  day: { flex: 1, alignItems: 'center', gap: spacing.xs },
  dayBar: {
    width: '100%',
    height: 40,
    justifyContent: 'flex-end',
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  sectionTitle: { marginTop: spacing.sm },
  runCard: { gap: spacing.md },
  runHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pills: { flexDirection: 'row', gap: spacing.sm },
  runStats: { flexDirection: 'row', gap: spacing.md },
});
