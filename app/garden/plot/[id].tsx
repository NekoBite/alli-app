import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import {
  Card,
  EmptyState,
  KeyValueCard,
  ListRow,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatTile,
  Text,
} from '@/components';
import { hasMinigame } from '@/features/garden/minigames';
import { CONDITIONS, MINIGAMES, PRACTICES } from '@/features/garden/rules';
import { TreeStage } from '@/features/garden/scene';
import { useGardenStore } from '@/features/garden/store';
import type { Health, MinigameId } from '@/features/garden/types';
import { StatusMeters } from '@/features/garden/ui';
import { colors, radius, spacing } from '@/theme';
import { formatStars } from '@/utils/format';
import { countdown } from '@/utils/time';

const HEALTH: Record<Health, { label: string; color: string }> = {
  thriving: { label: 'Thriving', color: colors.ok },
  stressed: { label: 'Needs care', color: colors.warn },
  wilting: { label: 'Wilting', color: colors.danger },
  dead: { label: 'Died', color: colors.inkFaint },
  retired: { label: 'Retired', color: colors.warn },
};

const GAME_ORDER: MinigameId[] = ['compost', 'mulch', 'haze'];

/** 3.3 Tree detail — growth stage, nightly yield, health, meters, and the minigames. */
export default function PlotScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const view = useGardenStore((state) => state.views().find((plot) => plot.id === id));
  const allViews = useGardenStore((state) => state.views);
  const tap = useGardenStore((state) => state.tap);
  const claim = useGardenStore((state) => state.claim);

  if (!view) {
    return (
      <Screen>
        <ScreenHeader title="Tree" back />
        <EmptyState
          title="Tree not found"
          body="This plot is no longer in your garden."
          actionLabel="Back to garden"
          onAction={() => router.replace('/(tabs)/garden')}
        />
      </Screen>
    );
  }

  const index = allViews().findIndex((v) => v.id === view.id) + 1;
  const lowCarbon = view.seed.careProfile === 'lowCarbon';
  const planted = new Date(view.plantedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const stage = view.stage[0]!.toUpperCase() + view.stage.slice(1);
  const health = HEALTH[view.health];
  const games = lowCarbon ? GAME_ORDER.filter(hasMinigame) : [];

  const play = (game: MinigameId) =>
    router.push({ pathname: '/garden/minigame/[game]', params: { game, plotId: view.id } });

  return (
    <Screen>
      <ScreenHeader
        eyebrow={`Plot ${String(index).padStart(2, '0')} · planted ${planted}`}
        title={view.seed.name}
        back
      />

      <View style={styles.stage}>
        <TreeStage
          view={view}
          popped={0}
          onTapTree={() => void tap(view.id).catch(() => undefined)}
          onTapSparkle={() => void claim(view.id).catch(() => undefined)}
        />
      </View>

      <View style={styles.stats}>
        <StatTile label="Stage" value={stage} />
        <StatTile label="Per night" value={`${formatStars(view.nextReward)} ★`} />
        <StatTile label="Health" value={health.label} color={health.color} />
      </View>

      <Card style={styles.block}>
        <StatusMeters meters={view.meters} caption={false} />
      </Card>

      {games.length ? (
        <Card style={[styles.block, styles.tight]}>
          <SectionHeader
            title="Earn compost & practices"
            note={view.compost.maturing ? `heap ${countdown(view.compost.msUntilMature)}` : `${view.compost.ready} compost ready`}
          />
          {games.map((game) => {
            const rule = MINIGAMES[game];
            const grants = rule.grants.compost ? '+ compost' : '+1 practice';
            return (
              <ListRow
                key={game}
                glyph={rule.label[0] ?? '?'}
                title={rule.label}
                subtitle={`${Math.round(rule.durationMs / 1000)} s · ${rule.blurb}`}
                value={grants.split(' ')[0]}
                valueSub={grants.split(' ').slice(1).join(' ')}
                disabled={game === 'compost' && view.compost.maturing}
                onPress={() => play(game)}
              />
            );
          })}
        </Card>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title="Care history" />
        <KeyValueCard
          lines={[
            { label: 'Age', value: `Day ${Math.floor(view.ageDays) + 1} of ${view.seed.lifetimeDays}` },
            { label: 'Streak', value: `${view.streakDays} ${view.streakDays === 1 ? 'night' : 'nights'}` },
            { label: 'Sparkles waiting', value: `${formatStars(view.claimableStars)} ★` },
            ...(lowCarbon
              ? [
                  { label: 'Compost used', value: String(view.composts) },
                  { label: 'Synthetic used', value: String(view.synthetics), color: view.synthetics ? colors.warn : undefined },
                  { label: 'Carbon multiplier', value: `×${view.carbonMultiplier.toFixed(2)}` },
                ]
              : []),
            { label: 'Run bonus while thriving', value: `+${Math.round(view.seed.runBonus * 100)}%` },
            { label: 'Real tree', value: view.realTreeRef ?? 'Not paired' },
          ]}
          total={{
            label: 'Harvest at maturity',
            value: `up to ${formatStars(view.seed.starsPerDay * view.seed.lifetimeDays)} ★`,
          }}
        />
      </View>

      {view.practices.map((practice) => (
        <Text key={practice} variant="caption" color={colors.ok} style={styles.lesson}>
          {PRACTICES[practice].label} — {PRACTICES[practice].lesson}
        </Text>
      ))}
      {view.activeConditions.map((condition) => (
        <Text key={condition} variant="caption" color={colors.warn} style={styles.lesson}>
          {CONDITIONS[condition].label} now — {CONDITIONS[condition].lesson}
        </Text>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stage: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 14,
  },
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: 14 },
  block: { marginBottom: 14 },
  tight: { paddingBottom: 8 },
  section: { marginTop: spacing.sm },
  lesson: { marginTop: spacing.sm },
});
