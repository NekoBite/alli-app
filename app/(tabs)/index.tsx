import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Pill,
  ProgressBar,
  Row,
  Screen,
  SectionHeader,
  StatTile,
  Text,
} from '@/components';
import { useGardenStore } from '@/features/garden/store';
import { weekGoals } from '@/features/run/goals';
import { pointsToAlli, REWARD_RULES } from '@/features/run/rewards';
import { useRunStore } from '@/features/run/store';
import { useWalletStore } from '@/features/wallet/store';
import { colors, spacing } from '@/theme';
import { formatFiat, formatPoints, formatToken } from '@/utils/format';
import { countdown } from '@/utils/time';

export default function HomeScreen() {
  const router = useRouter();
  const run = useRunStore();
  const garden = useGardenStore();
  const wallet = useWalletStore();

  useEffect(() => {
    void run.refresh();
    void garden.refresh();
    void wallet.load();
    // Run once on mount; each store guards its own refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const views = garden.views();
  const readyToHarvest = views.filter((view) => view.harvestable);
  const nextUp = views
    .filter((view) => !view.harvestable && view.stage !== 'spent')
    .sort((a, b) => a.msUntilHarvest - b.msUntilHarvest)[0];

  const alli = wallet.balanceOf('ALLI');
  const capProgress = run.pointsEarnedToday / REWARD_RULES.dailyPointsCap;
  const canRun = run.canStart();
  // The last bucket is today — steps are what the points came from.
  const today = weekGoals(run.history).at(-1);

  return (
    <Screen
      onRefresh={() => {
        void run.refresh();
        void garden.refresh();
        void wallet.refreshBalances();
      }}
      refreshing={run.loading}
    >
      <View style={styles.hero}>
        <Text variant="label" color={colors.ink2}>
          Redeemable points
        </Text>
        <Text variant="hero" color={colors.green}>
          {formatPoints(run.pointsBalance)}
        </Text>
        <Text variant="caption" color={colors.ink2}>
          ≈ {formatToken(pointsToAlli(run.pointsBalance), 'ALLI')} ·{' '}
          {REWARD_RULES.pointsPerAlli.toLocaleString()} points = 1 ALLI
        </Text>
      </View>

      <Card style={styles.block}>
        <View style={styles.rowBetween}>
          <Text variant="heading">Today</Text>
          <Pill
            label={run.streakDays > 0 ? `${run.streakDays} day streak` : 'No streak'}
            color={run.streakDays > 0 ? colors.green : colors.ink3}
            dot
          />
        </View>

        <View style={styles.stats}>
          <StatTile label="Earned" value={formatPoints(run.pointsEarnedToday)} unit="pts" />
          <StatTile
            label="Multiplier"
            value={`${run.multiplier.toFixed(2)}×`}
            color={colors.cyan}
          />
        </View>

        <View style={styles.stats}>
          <StatTile label="Steps" value={formatPoints(today?.steps ?? 0)} />
          <StatTile
            label="Stars"
            value={run.entitlement.starsToday.toString()}
            color={colors.gold}
          />
          <StatTile
            label="Runs left"
            value={run.entitlement.runsLeft.toString()}
            color={run.entitlement.runsLeft > 0 ? colors.ink : colors.warning}
          />
        </View>

        <ProgressBar progress={capProgress} />
        <Text variant="caption" color={colors.ink2}>
          {formatPoints(Math.max(0, REWARD_RULES.dailyPointsCap - run.pointsEarnedToday))} of
          today&apos;s {formatPoints(REWARD_RULES.dailyPointsCap)} point cap left
        </Text>

        <Button
          label="Start a run"
          onPress={() => router.push('/run/active')}
          size="lg"
          disabled={!canRun.ok}
        />
        {canRun.reason ? (
          <Text variant="caption" color={colors.warning}>
            {canRun.reason}
          </Text>
        ) : null}
      </Card>

      <SectionHeader
        title="Garden"
        subtitle={`${views.length} planted · ${readyToHarvest.length} ready`}
        actionLabel="Open"
        onAction={() => router.push('/(tabs)/garden')}
      />
      <Card style={styles.block}>
        {readyToHarvest.length > 0 ? (
          <Row
            label={`${readyToHarvest.length} tree${readyToHarvest.length > 1 ? 's' : ''} ready`}
            value={formatToken(
              readyToHarvest.reduce((sum, view) => sum + view.seed.yieldAlli, 0),
              'ALLI',
            )}
            valueColor={colors.green}
            emphasis
          />
        ) : (
          <Row label="Nothing ready yet" value="—" />
        )}
        {nextUp ? (
          <Row
            label={`Next: ${nextUp.seed.name}`}
            value={countdown(nextUp.msUntilHarvest)}
            valueColor={colors.ink2}
          />
        ) : null}
        <Row
          label="Garden run bonus"
          value={`${((garden.multiplier() - 1) * 100).toFixed(0)}%`}
          valueColor={colors.cyan}
        />
      </Card>

      <SectionHeader
        title="Wallet"
        actionLabel="Open"
        onAction={() => router.push('/(tabs)/wallet')}
      />
      <Card style={styles.block}>
        <Row
          label="ALLI"
          value={alli ? formatToken(alli.formatted, 'ALLI') : '—'}
          valueColor={colors.green}
          emphasis
        />
        {wallet.card ? (
          <Row
            label={`Visa •••• ${wallet.card.last4 ?? '----'}`}
            value={formatFiat(wallet.card.availableUsd)}
            valueColor={wallet.card.frozen ? colors.ink3 : colors.gold}
          />
        ) : (
          <Row label="No card yet" value="Apply" valueColor={colors.gold} />
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingTop: spacing.xl, paddingBottom: spacing.xl, gap: spacing.xs },
  block: { gap: spacing.md, marginBottom: spacing.xl },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stats: { flexDirection: 'row', gap: spacing.lg },
});
