import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Avatar,
  Button,
  Card,
  InviteBanner,
  ListRow,
  Pill,
  ProgressBar,
  Screen,
  ScreenHeader,
  StatTile,
  Text,
} from '@/components';
import { useAuthStore } from '@/features/auth/store';
import { useGardenStore } from '@/features/garden/store';
import { initialsFor, openProfileMenu } from '@/features/profile/menu';
import { formatCount, msLeft, progressFraction } from '@/features/quests/quests';
import { useQuestStore } from '@/features/quests/store';
import { useReferralStore } from '@/features/referrals/store';
import { questProgress, REWARD_RULES } from '@/features/run/rewards';
import { useRunStore } from '@/features/run/store';
import { useWalletStore } from '@/features/wallet/store';
import { colors, spacing } from '@/theme';
import { formatMoney, formatPoints, formatStars, formatToken } from '@/utils/format';

function greeting(hour = new Date().getHours()): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

/** 2.1 Today — one glance at the quest, the garden, the weekly quest and the balance. */
export default function TodayScreen() {
  const router = useRouter();
  const run = useRunStore();
  const garden = useGardenStore();
  const wallet = useWalletStore();
  const quest = useQuestStore();
  const hub = useReferralStore((s) => s.hub);
  const refreshHub = useReferralStore((s) => s.refreshHub);
  const user = useAuthStore((s) => s.user);

  const refreshAll = () => {
    void run.refresh();
    void garden.refresh();
    void wallet.load();
    void quest.refresh();
    void refreshHub();
  };

  useEffect(() => {
    refreshAll();
    // Run once on mount; each store guards its own refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const views = garden.views();
  const sparklesWaiting = views.reduce((sum, view) => sum + view.claimableStars, 0);
  const alli = wallet.balanceOf('ALLI');
  const canRun = run.canStart();
  const progress = questProgress(run.profile.stepsToday);
  const firstName = user?.displayName?.split(/\s+/)[0] ?? 'runner';

  const snapshot = quest.snapshot;
  const weekLeftDays = snapshot
    ? Math.ceil(msLeft(snapshot.current.quest, snapshot.serverTime) / 86_400_000)
    : 0;

  return (
    <Screen inTabs onRefresh={refreshAll} refreshing={run.loading}>
      <ScreenHeader
        eyebrow={`${greeting()}, ${firstName}`}
        title="Today"
        right={<Avatar initials={initialsFor(user)} onPress={openProfileMenu} />}
      />

      <View style={styles.stack}>
        <InviteBanner
          title="Invite & earn"
          subtitle={
            hub
              ? `4 referral programs · ${`${formatMoney(hub.totalEarnedUsdt)} USDT`} earned`
              : '4 referral programs · one link per feature'
          }
          href="/referrals"
        />

        <Card tone="hero" style={styles.quest}>
          <View style={styles.rowBetween}>
            <Text variant="label" color={colors.redHot}>
              Today’s quest
            </Text>
            <Pill label={`${Math.round(progress * 100)}%`} />
          </View>
          <View style={styles.baseline}>
            <Text variant="hero">{formatPoints(run.profile.stepsToday)}</Text>
            <Text variant="body" color={colors.inkDim}>
              / {formatPoints(REWARD_RULES.dailyStepGoal)} steps
            </Text>
          </View>
          <ProgressBar progress={progress} height={10} />
          <View style={styles.stats}>
            <StatTile label="Stars today" value={`${formatStars(run.profile.starsEarnedToday)} ★`} />
            <StatTile
              label="Runs left"
              value={run.entitlementError ? '—' : String(run.entitlement.runsLeft)}
              color={run.entitlement.runsLeft > 0 || run.entitlementError ? colors.ink : colors.warn}
            />
            <StatTile label="Streak" value={`${run.profile.streakDays} d`} />
          </View>
          <Button
            label="Start a run"
            onPress={() => router.push('/run/active')}
            disabled={!canRun.ok}
          />
          {canRun.reason ? (
            <Text variant="caption" color={colors.warn}>
              {canRun.reason}
            </Text>
          ) : null}
        </Card>

        <Card style={styles.tight}>
          <ListRow
            glyph="G"
            title="Garden"
            subtitle={
              views.length === 0
                ? 'Plant a seed to start earning overnight'
                : `${formatStars(sparklesWaiting)} sparkles on your trees`
            }
            value={`+${formatStars(sparklesWaiting)} ★`}
            valueSub="collect"
            chevron={false}
            onPress={() => router.push('/(tabs)/garden')}
          />
        </Card>

        {snapshot ? (
          <Card onPress={() => router.push('/quests/weekly')} style={styles.weekly} accessibilityLabel="Weekly community quest">
            <View style={styles.rowBetween}>
              <Text variant="label" color={colors.inkFaint}>
                Weekly community quest
              </Text>
              <Text variant="mono" color={colors.inkFaint}>
                {weekLeftDays}d left
              </Text>
            </View>
            <Text variant="bodyStrong" style={styles.weeklyTitle}>
              {snapshot.current.quest.title}
            </Text>
            <ProgressBar progress={progressFraction(snapshot.current)} height={6} />
            <Text variant="mono" color={colors.inkFaint}>
              {formatCount(snapshot.current.community)} / {formatCount(snapshot.current.quest.goal)} ·{' '}
              {Math.round(progressFraction(snapshot.current) * 100)}%
            </Text>
          </Card>
        ) : null}

        <Card style={styles.tight}>
          <ListRow
            glyph="A"
            title="ALLI balance"
            subtitle="BEP-20 · BNB Smart Chain"
            value={alli ? formatToken(alli.formatted) : '—'}
            valueSub="ALLI"
            chevron={false}
            onPress={() => router.push('/(tabs)/wallet')}
          />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  quest: { gap: 14 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  baseline: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  stats: { flexDirection: 'row', gap: spacing.sm },
  tight: { paddingVertical: 7 },
  weekly: { gap: 10 },
  weeklyTitle: { fontSize: 16 },
});
