import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  Pill,
  ProgressBar,
  Row,
  Screen,
  StatTile,
  Text,
} from '@/components';
import { remainingYield } from '@/features/garden/growth';
import { useGardenStore } from '@/features/garden/store';
import { colors, spacing } from '@/theme';
import { formatToken } from '@/utils/format';
import { countdown } from '@/utils/time';

export default function PlotScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const harvest = useGardenStore((state) => state.harvest);
  const view = useGardenStore((state) => state.views().find((plot) => plot.id === id));

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

  const onHarvest = async () => {
    try {
      const alli = await harvest(view.id);
      Alert.alert('Harvested', `${formatToken(alli, 'ALLI')} credited to your wallet.`);
    } catch (error) {
      Alert.alert('Could not harvest', (error as Error).message);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text variant="title">{view.seed.name}</Text>
        <Text variant="caption" color={colors.ink2}>
          {view.seed.species}
        </Text>
        <Pill
          label={view.harvestable ? 'Ready to harvest' : view.stage}
          color={view.harvestable ? colors.green : premium ? colors.gold : colors.ink2}
          dot
        />
      </View>

      <Card tone={premium ? 'premium' : 'default'} style={styles.card}>
        <ProgressBar
          progress={view.progress}
          color={view.harvestable ? colors.green : premium ? colors.gold : colors.cyan}
          height={10}
        />
        <Text variant="caption" color={colors.ink2}>
          {view.harvestable
            ? 'Harvest now to start the next cycle.'
            : `Next harvest in ${countdown(view.msUntilHarvest)}`}
        </Text>

        <View style={styles.stats}>
          <StatTile
            label="Per harvest"
            value={formatToken(view.seed.yieldAlli)}
            unit="ALLI"
            color={colors.green}
          />
          <StatTile label="Harvests left" value={String(view.harvestsRemaining)} />
          <StatTile
            label="Run bonus"
            value={`+${(view.seed.joggingBonus * 100).toFixed(0)}%`}
            color={colors.cyan}
          />
        </View>
      </Card>

      <Card style={styles.card} tone="muted">
        <Row label="Planted" value={new Date(view.plantedAt).toLocaleDateString()} />
        <Row label="Cycle length" value={`${view.seed.growthHours}h`} />
        <Row
          label="Remaining yield"
          value={formatToken(remainingYield(view), 'ALLI')}
          valueColor={colors.green}
          emphasis
        />
        <Row
          label="Real tree"
          value={view.realTreeRef ?? 'Not paired'}
          valueColor={view.realTreeRef ? colors.teal : colors.ink3}
        />
      </Card>

      {view.realTreeRef ? (
        <Text variant="caption" color={colors.ink3} style={styles.note}>
          This plot is paired with a tree planted by a partner nursery. The reference is the
          partner&apos;s planting record — the app does not verify it independently.
        </Text>
      ) : null}

      {view.harvestable ? (
        <Button
          label={`Harvest ${formatToken(view.seed.yieldAlli, 'ALLI')}`}
          size="lg"
          variant={premium ? 'premium' : 'primary'}
          onPress={() => void onHarvest()}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: spacing.xl, gap: spacing.sm, alignItems: 'flex-start' },
  card: { gap: spacing.md, marginBottom: spacing.lg },
  stats: { flexDirection: 'row', gap: spacing.md },
  note: { marginBottom: spacing.lg },
});
