import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  IconTile,
  InviteBanner,
  Pill,
  ProgressBar,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatTile,
  Text,
} from '@/components';
import { weekGoals, type DayGoal } from '@/features/run/goals';
import { questProgress, REWARD_RULES, starsToAlli } from '@/features/run/rewards';
import { SHOE_ORDER, SHOES, shoeFor, type ShoeTier } from '@/features/run/shoes';
import { useRunStore } from '@/features/run/store';
import type { RunSummary } from '@/features/run/types';
import { colors, gradient, radius, spacing } from '@/theme';
import { formatDistance, formatDuration, formatPoints, formatStars, formatToken } from '@/utils/format';
import { relativeTime } from '@/utils/time';
import { LinearGradient } from 'expo-linear-gradient';

/** 2.2 ALLI RUN — the run hub: quest, run balance, stars, shoes and the week. */
export default function RunScreen() {
  const router = useRouter();
  const { history, profile, entitlement, entitlementError, refresh, loading, canStart } =
    useRunStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const start = canStart();
  const shoe = shoeFor(profile.shoeTier);
  const top = SHOES[SHOE_ORDER[SHOE_ORDER.length - 1] ?? 'leather'];
  const member = entitlement.membership.status === 'active';
  const week = weekGoals(history);

  return (
    <Screen inTabs onRefresh={refresh} refreshing={loading}>
      <ScreenHeader
        eyebrow="Run the future"
        title="ALLI RUN"
        right={
          <Pill
            label={member ? 'Member' : 'No membership'}
            color={member ? colors.ok : colors.inkFaint}
          />
        }
      />

      <View style={styles.stack}>
        <InviteBanner title="Invite runners" subtitle="40% of their Silver upgrade" href="/referrals/run" />

        <Card tone="hero" style={styles.gap}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text variant="label" color={colors.redHot}>
                Today’s quest
              </Text>
              <Text variant="heading" style={styles.questFigure}>
                {formatPoints(profile.stepsToday)} / {formatPoints(REWARD_RULES.dailyStepGoal)}
              </Text>
            </View>
            <Button
              label="Start"
              size="sm"
              disabled={!start.ok}
              onPress={() => router.push('/run/active')}
              style={styles.start}
            />
          </View>
          <ProgressBar progress={questProgress(profile.stepsToday)} />
          {start.reason ? (
            <Text variant="caption" color={colors.warn}>
              {start.reason}
            </Text>
          ) : null}
        </Card>

        <Card style={styles.gap}>
          <SectionHeader
            title="Run balance"
            actionLabel="Buy runs"
            onAction={() => router.push('/run/credits')}
          />
          <View style={styles.stats}>
            <StatTile
              label="This month"
              value={`${entitlement.runsThisMonth}/${entitlement.membership.runsPerRenewal}`}
            />
            <StatTile
              label="Runs left"
              value={entitlementError ? '—' : String(entitlement.runsLeft)}
              color={entitlement.runsLeft > 0 || entitlementError ? colors.ink : colors.warn}
            />
            <StatTile label="Streak" value={`${profile.streakDays} d`} />
          </View>
          {entitlementError ? (
            <Text variant="caption" color={colors.inkFaint}>
              Run credits could not be read. The server decides whether a run is recorded.
            </Text>
          ) : null}
        </Card>

        <Card style={styles.gap}>
          <Text variant="label" color={colors.inkFaint}>
            Stars
          </Text>
          <View style={styles.rowBetween}>
            <Text variant="title">{formatStars(profile.starsBalance)} ★</Text>
            <Button
              label="Exchange"
              variant="secondary"
              size="sm"
              disabled={profile.starsBalance <= 0}
              onPress={() => router.push('/run/stars')}
            />
          </View>
          <Text variant="mono" color={colors.inkFaint}>
            1 ★ = {formatToken(starsToAlli(1))} ALLI · exchange any time
          </Text>
        </Card>

        <Card style={styles.gap}>
          <SectionHeader title="Your shoes" note={`up to ${top.rewardMultiplier}×`} />
          <View style={styles.shoes}>
            {SHOE_ORDER.map((tier) => (
              <ShoeTile
                key={tier}
                tier={tier}
                owned={SHOE_ORDER.indexOf(tier) <= SHOE_ORDER.indexOf(shoe.tier)}
                current={tier === shoe.tier}
              />
            ))}
          </View>
        </Card>

        <Card style={styles.gap}>
          <SectionHeader title="This week" note={`${formatPoints(week.reduce((s, d) => s + d.steps, 0))} steps`} />
          <WeekChart days={week} />
        </Card>

        <SectionHeader title="Recent runs" />
        {history.length === 0 ? (
          <EmptyState
            glyph="R"
            title="No runs yet"
            body="Finished runs show up here with the steps they added to the quest, and why."
          />
        ) : (
          history.slice(0, 10).map((run) => <RunRow key={run.id} run={run} />)
        )}
      </View>
    </Screen>
  );
}

function ShoeTile({ tier, owned, current }: { tier: ShoeTier; owned: boolean; current: boolean }) {
  const shoe = SHOES[tier];
  const detail = () =>
    Alert.alert(
      `${shoe.name} NFT shoe`,
      `${shoe.blurb}\n\n×${shoe.rewardMultiplier.toFixed(1)} on the daily quest.${
        owned ? '' : '\n\nNot owned yet. Upgrades are sold as NFTs on BNB Smart Chain.'
      }`,
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${shoe.name} shoe, ${owned ? 'owned' : 'locked'}`}
      onPress={detail}
      style={[styles.shoe, current && styles.shoeCurrent, !owned && styles.shoeLocked]}
    >
      <IconTile glyph={shoe.name[0] ?? '?'} size={34} />
      <Text variant="bodyStrong" style={styles.shoeName}>
        {shoe.name}
      </Text>
      <Text variant="mono" color={current ? colors.redHot : colors.inkFaint}>
        ×{shoe.rewardMultiplier.toFixed(1)}
      </Text>
    </Pressable>
  );
}

/** Bar per day, today in the primary gradient; a bar that met the quest is full-strength red. */
function WeekChart({ days }: { days: DayGoal[] }) {
  const max = Math.max(REWARD_RULES.dailyStepGoal, ...days.map((d) => d.steps));
  return (
    <View style={styles.chart} accessibilityLabel="Steps per day this week">
      {days.map((day) => {
        const h = Math.max(4, (day.steps / max) * 84);
        return (
          <View key={day.day} style={styles.col}>
            <View style={styles.barSlot}>
              {day.isToday ? (
                <LinearGradient colors={gradient.primary} style={[styles.bar, { height: h }]} />
              ) : (
                <View
                  style={[
                    styles.bar,
                    { height: h, backgroundColor: day.questMet ? colors.red : 'rgba(226, 69, 34, 0.3)' },
                  ]}
                />
              )}
            </View>
            <Text variant="mono" color={day.isToday ? colors.redHot : colors.inkFaint}>
              {day.label.slice(0, 1)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function RunRow({ run }: { run: RunSummary }) {
  const counted = run.reward.eligibleSteps > 0;
  return (
    <Card tone={counted ? 'default' : 'muted'} style={styles.gap} onPress={undefined}>
      <View style={styles.rowBetween}>
        <Text variant="mono" color={colors.inkDim}>
          {relativeTime(run.startedAt)}
        </Text>
        <View style={styles.pills}>
          {run.reward.stars > 0 ? <Pill label={`+${formatStars(run.reward.stars)} ★`} /> : null}
          <Pill
            label={counted ? `+${formatPoints(run.reward.eligibleSteps)} steps` : 'Not counted'}
            color={counted ? colors.ok : colors.warn}
          />
        </View>
      </View>
      <View style={styles.stats}>
        <StatTile kind="bare" label="Distance" value={`${formatDistance(run.distanceMetres)} km`} />
        <StatTile kind="bare" label="Moving" value={formatDuration(run.movingSeconds)} />
        <StatTile kind="bare" label="Steps" value={formatPoints(run.reward.steps)} />
      </View>
      {run.reward.flags.length > 0 ? (
        <Text variant="mono" color={colors.warn}>
          {run.reward.flags.join(' · ')}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: 14 },
  gap: { gap: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  questFigure: { fontSize: 22, marginTop: 6 },
  start: { minWidth: 76, minHeight: 40 },
  stats: { flexDirection: 'row', gap: spacing.sm },
  shoes: { flexDirection: 'row', gap: spacing.sm },
  shoe: {
    flex: 1,
    gap: 6,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised2,
  },
  shoeCurrent: { borderColor: colors.redHot, backgroundColor: 'rgba(226, 69, 34, 0.12)' },
  shoeLocked: { opacity: 0.45 },
  shoeName: { fontSize: 13 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 110 },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  barSlot: { height: 86, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '70%', borderRadius: 4 },
  pills: { flexDirection: 'row', gap: spacing.sm },
});
