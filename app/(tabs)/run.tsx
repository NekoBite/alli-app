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
import { questProgress, REWARD_RULES, starsToAlli, stepsToGo } from '@/features/run/rewards';
import { SHOES, SHOE_ORDER, shoeFor } from '@/features/run/shoes';
import { useRunStore } from '@/features/run/store';
import type { RunSummary } from '@/features/run/types';
import { colors, radius, spacing } from '@/theme';
import { formatDistance, formatDuration, formatPoints, formatToken, formatStars } from '@/utils/format';
import { formatServerTime, relativeTime } from '@/utils/time';

export default function RunScreen() {
  const router = useRouter();
  const { history, profile, entitlement, entitlementError, refresh, loading, canStart } =
    useRunStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = canStart();
  const week = weekGoals(history);
  const totals = weekTotals(week);
  const buyableLeft = remainingPurchasableRuns(entitlement.extraRunsBoughtThisMonth);

  const shoe = shoeFor(profile.shoeTier);
  const questDone = profile.starsEarnedToday > 0;
  const progress = questProgress(profile.stepsToday);
  const toGo = stepsToGo(profile.stepsToday);
  const questPays = REWARD_RULES.starsPerQuest * shoe.rewardMultiplier;

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
                <Text variant="heading">Today&apos;s quest</Text>
                <Pill
                  label={questDone ? 'Complete' : 'In progress'}
                  color={questDone ? colors.green : colors.cyan}
                  dot
                />
              </View>

              <View style={styles.metricRow}>
                <Text variant="title" color={questDone ? colors.green : colors.ink}>
                  {formatPoints(profile.stepsToday)}
                </Text>
                <Text variant="body" color={colors.ink2}>
                  of {formatPoints(REWARD_RULES.dailyStepGoal)} steps
                </Text>
              </View>
              <ProgressBar progress={progress} color={questDone ? colors.green : colors.cyan} />

              <Text variant="caption" color={colors.ink2}>
                {questDone
                  ? `Quest complete — ${questPays} star${questPays === 1 ? '' : 's'} earned today. Steps from here count towards tomorrow.`
                  : `${formatPoints(toGo)} GPS-verified steps to go. Completing pays ${questPays} star${questPays === 1 ? '' : 's'} at your ${shoe.name} tier.`}
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
            </Card>

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
                <StatTile label="This month" value={entitlement.runsThisMonth.toString()} />
                <StatTile
                  label="Runs left"
                  value={entitlement.runsLeft.toString()}
                  color={entitlement.runsLeft > 0 ? colors.ink : colors.warning}
                />
                <StatTile label="Streak" value={`${profile.streakDays}d`} color={colors.cyan} />
              </View>

              <Text variant="caption" color={colors.ink3}>
                One credit per recorded run · credits never expire · server time{' '}
                {formatServerTime(entitlement.serverTime)}
              </Text>
              <Text variant="caption" color={colors.ink2}>
                {formatToken(RUN_CREDIT_RULES.extraRunPriceUsdt, 'USDT')} per extra run · bought{' '}
                {entitlement.extraRunsBoughtThisMonth}/{RUN_CREDIT_RULES.maxExtraRunsPerMonth} this
                month
              </Text>
              <Button
                label="Buy runs"
                variant="secondary"
                disabled={buyableLeft === 0}
                onPress={() => router.push('/run/credits')}
              />
              {entitlementError ? (
                <Text variant="caption" color={colors.ink3}>
                  Run credits could not be read ({entitlementError}). The server decides whether a
                  run is recorded.
                </Text>
              ) : null}
            </Card>

            <Card style={styles.card} tone="premium">
              <View style={styles.rowBetween}>
                <Text variant="heading">Stars</Text>
                <Text variant="title" color={colors.gold}>
                  {formatStars(profile.starsBalance)}
                </Text>
              </View>
              <Text variant="caption" color={colors.ink2}>
                ≈ {formatToken(starsToAlli(profile.starsBalance), 'ALLI')} · 1 star ={' '}
                {formatToken(REWARD_RULES.alliPerStar, 'ALLI')}
              </Text>
              <Button
                label="Exchange stars for ALLI"
                variant="secondary"
                disabled={profile.starsBalance <= 0}
                onPress={() => router.push('/run/stars')}
              />
            </Card>

            <SectionHeader
              title="Your shoes"
              subtitle={`${shoe.name} · ${shoe.rewardMultiplier}× the daily reward`}
            />
            <Card style={styles.card}>
              {SHOE_ORDER.map((tier) => (
                <Row
                  key={tier}
                  label={SHOES[tier].name}
                  value={`${SHOES[tier].rewardMultiplier}× · ${REWARD_RULES.starsPerQuest * SHOES[tier].rewardMultiplier} ★/day`}
                  valueColor={tier === shoe.tier ? colors.gold : colors.ink2}
                  emphasis={tier === shoe.tier}
                />
              ))}
              <Text variant="caption" color={colors.ink3}>
                {shoe.blurb} Upgrading is not built yet — the tier is issued and held server-side.
              </Text>
            </Card>

            <SectionHeader
              title="This week"
              subtitle={`${totals.questDays} of ${GOAL_RULES.weekDays} quests completed`}
            />
            <Card style={styles.card}>
              <View style={styles.week}>
                {week.map((day) => (
                  <DayColumn key={day.day} day={day} />
                ))}
              </View>
              <View style={styles.stats}>
                <StatTile label="Steps" value={formatPoints(totals.steps)} />
                <StatTile label="Distance" value={formatDistance(totals.metres)} unit="km" />
              </View>
              <View style={styles.stats}>
                <StatTile
                  label="Move minutes"
                  value={Math.round(totals.movingSeconds / 60).toString()}
                />
                <StatTile label="Stars" value={formatStars(totals.stars)} color={colors.gold} />
              </View>
            </Card>

            <Text variant="heading" style={styles.sectionTitle}>
              Recent runs
            </Text>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No runs yet"
            body="Your finished runs show up here with the steps they added to the quest, and why."
          />
        }
        renderItem={({ item }) => <RunRow run={item} />}
        contentContainerStyle={styles.list}
      />
    </Screen>
  );
}

/** One day in the week strip: quest progress, its weekday, today picked out. */
function DayColumn({ day }: { day: DayGoal }) {
  return (
    <View style={styles.day}>
      <View style={styles.dayBar}>
        <ProgressBar
          progress={Math.min(1, day.steps / GOAL_RULES.dailyStepGoal)}
          color={day.questMet ? colors.green : colors.cyan}
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
  const counted = run.reward.eligibleSteps > 0;

  return (
    <Card style={styles.runCard} tone={counted ? 'default' : 'muted'}>
      <View style={styles.runHead}>
        <Text variant="caption" color={colors.ink2}>
          {relativeTime(run.startedAt)}
        </Text>
        <View style={styles.pills}>
          {run.reward.stars > 0 ? (
            <Pill label={`+${run.reward.stars} ★`} color={colors.gold} />
          ) : null}
          {counted ? (
            <Pill label={`+${formatPoints(run.reward.eligibleSteps)} steps`} color={colors.green} />
          ) : (
            <Pill label="Not counted" color={colors.warning} />
          )}
        </View>
      </View>

      <View style={styles.runStats}>
        <StatTile label="Steps" value={formatPoints(run.reward.steps)} />
        <StatTile label="Distance" value={formatDistance(run.distanceMetres)} unit="km" />
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
  metricRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
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
