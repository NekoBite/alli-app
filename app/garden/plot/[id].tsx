import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Card, EmptyState, Pill, Row, Screen, Text } from '@/components';
import { CONDITIONS, PRACTICES } from '@/features/garden/rules';
import { useGardenStore } from '@/features/garden/store';
import { StatusMeters } from '@/features/garden/ui';
import { colors, spacing } from '@/theme';
import { formatStars } from '@/utils/format';
import { countdown } from '@/utils/time';

export default function PlotScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const view = useGardenStore((state) => state.views().find((plot) => plot.id === id));
  const tapsFor = useGardenStore((state) => state.tapsFor);

  if (!view) {
    return (
      <Screen>
        <EmptyState
          title="Tree not found"
          body="This plot is no longer in your garden."
          actionLabel="Back to garden"
          onAction={() => router.replace('/(tabs)/garden')}
        />
      </Screen>
    );
  }

  const premium = view.seed.tier === 'premium';
  const lowCarbon = view.seed.careProfile === 'lowCarbon';

  return (
    <Screen>
      <View style={styles.hero}>
        <Text variant="title">{view.seed.name}</Text>
        <Text variant="caption" color={colors.ink2}>
          {view.seed.species}
        </Text>
        <Pill
          label={lowCarbon ? 'Low-carbon care' : 'Simple care'}
          color={premium ? colors.gold : colors.teal}
        />
      </View>

      <Card tone={premium ? 'premium' : 'default'} style={styles.card}>
        <StatusMeters meters={view.meters} />
      </Card>

      <Card style={styles.card}>
        <Row label="Planted" value={new Date(view.plantedAt).toLocaleDateString()} />
        <Row label="Age" value={`Day ${Math.floor(view.ageDays) + 1} of ${view.seed.lifetimeDays}`} />
        <Row label="Streak" value={`${view.streakDays} ${view.streakDays === 1 ? 'day' : 'days'}`} />
        <Row
          label="Pays per thriving night"
          value={`${formatStars(view.nextReward)} ★`}
          valueColor={colors.gold}
          emphasis
        />
        <Row
          label="Sparkles waiting"
          value={`${formatStars(view.claimableStars)} ★`}
          valueColor={view.claimableStars > 0 ? colors.gold : colors.ink2}
        />
        <Row label="Sun taps today" value={`${tapsFor(view.id)} / ${view.sunTapsNeeded}`} />
        <Row
          label="Run bonus while thriving"
          value={`+${(view.seed.runBonus * 100).toFixed(0)}%`}
          valueColor={colors.cyan}
        />
      </Card>

      {lowCarbon ? (
        <Card style={styles.card} tone="muted">
          <Text variant="heading">Low-carbon farm</Text>
          <Row
            label="Carbon multiplier"
            value={`${view.carbonMultiplier.toFixed(2)}×`}
            valueColor={view.carbonMultiplier >= 1 ? colors.green : colors.warning}
          />
          <Row label="Compost used" value={String(view.composts)} />
          <Row label="Synthetic used" value={String(view.synthetics)} valueColor={view.synthetics ? colors.warning : colors.ink} />
          <Row
            label="Compost"
            value={
              view.compost.maturing
                ? `Matures in ${countdown(view.compost.msUntilMature)}`
                : `${view.compost.ready} ready`
            }
          />
          {view.practices.length ? (
            view.practices.map((practice) => (
              <View key={practice} style={styles.lesson}>
                <Text variant="bodyStrong" color={colors.teal}>
                  {PRACTICES[practice].label}
                </Text>
                <Text variant="caption" color={colors.ink2}>
                  {PRACTICES[practice].lesson}
                </Text>
              </View>
            ))
          ) : (
            <Text variant="caption" color={colors.ink3}>
              No practices yet. Minigames during weather events teach and grant them.
            </Text>
          )}
          {view.activeConditions.map((condition) => (
            <View key={condition} style={styles.lesson}>
              <Text variant="bodyStrong" color={colors.warning}>
                {CONDITIONS[condition].label} now
              </Text>
              <Text variant="caption" color={colors.ink2}>
                {CONDITIONS[condition].lesson}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      <Card style={styles.card} tone="muted">
        <Row
          label="Real tree"
          value={view.realTreeRef ?? 'Not paired'}
          valueColor={view.realTreeRef ? colors.teal : colors.ink3}
        />
        {view.realTreeRef ? (
          <Text variant="caption" color={colors.ink3}>
            This plot is paired with a tree planted by a partner nursery. The reference is the
            partner&apos;s planting record — the app does not verify it independently.
          </Text>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: spacing.xl, gap: spacing.sm, alignItems: 'flex-start' },
  card: { gap: spacing.sm, marginBottom: spacing.lg },
  lesson: { gap: 2, paddingTop: spacing.sm },
});
