import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Alert, FlatList, StyleSheet, View } from 'react-native';

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
import { useGardenStore } from '@/features/garden/store';
import { remainingYield } from '@/features/garden/growth';
import { GardenScene } from '@/features/garden/scene';
import type { PlotView } from '@/features/garden/types';
import { colors, spacing } from '@/theme';
import { formatToken } from '@/utils/format';
import { countdown } from '@/utils/time';

export default function GardenScreen() {
  const router = useRouter();
  const { refresh, loading, harvest, views, multiplier } = useGardenStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const plots = views();
  const ready = plots.filter((view) => view.harvestable);
  const pending = ready.reduce((sum, view) => sum + view.seed.yieldAlli, 0);

  const onHarvest = async (view: PlotView) => {
    try {
      const alli = await harvest(view.id);
      Alert.alert('Harvested', `${formatToken(alli, 'ALLI')} credited to your wallet.`);
    } catch (error) {
      Alert.alert('Could not harvest', (error as Error).message);
    }
  };

  return (
    <Screen scroll={false}>
      <FlatList
        data={plots}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={refresh}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.header}>
            <GardenScene
              plots={plots}
              onPressPlant={(view) =>
                router.push({ pathname: '/garden/plot/[id]', params: { id: view.id } })
              }
              onPressGround={() => router.push('/garden/shop')}
            />

            <Card style={styles.card}>
              <View style={styles.stats}>
                <StatTile label="Trees" value={String(plots.length)} />
                <StatTile
                  label="Ready"
                  value={String(ready.length)}
                  color={ready.length ? colors.green : colors.ink}
                />
                <StatTile
                  label="Run bonus"
                  value={`+${((multiplier() - 1) * 100).toFixed(0)}%`}
                  color={colors.cyan}
                />
              </View>
              {pending > 0 ? (
                <Row
                  label="Waiting to be harvested"
                  value={formatToken(pending, 'ALLI')}
                  valueColor={colors.green}
                  emphasis
                />
              ) : null}
            </Card>

            <Button label="Buy seeds" size="lg" onPress={() => router.push('/garden/shop')} />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="Your garden is empty"
            body="Buy a seed with ALLI, or a premium seed with USDT for a bigger yield and a larger run bonus."
            actionLabel="Open the seed shop"
            onAction={() => router.push('/garden/shop')}
          />
        }
        renderItem={({ item }) => (
          <PlotCard
            view={item}
            onOpen={() => router.push({ pathname: '/garden/plot/[id]', params: { id: item.id } })}
            onHarvest={() => void onHarvest(item)}
          />
        )}
      />
    </Screen>
  );
}

function PlotCard({
  view,
  onOpen,
  onHarvest,
}: {
  view: PlotView;
  onOpen: () => void;
  onHarvest: () => void;
}) {
  const premium = view.seed.tier === 'premium';

  return (
    <Card tone={premium ? 'premium' : 'default'} onPress={onOpen} style={styles.plot}>
      <View style={styles.plotHead}>
        <View style={styles.plotTitle}>
          <Text variant="bodyStrong">{view.seed.name}</Text>
          <Text variant="caption" color={colors.ink2}>
            {view.seed.species}
          </Text>
        </View>
        <Pill
          label={view.stage}
          color={view.harvestable ? colors.green : premium ? colors.gold : colors.ink2}
          dot
        />
      </View>

      <ProgressBar
        progress={view.progress}
        color={view.harvestable ? colors.green : premium ? colors.gold : colors.cyan}
      />

      <Row
        label={view.harvestable ? 'Ready now' : `Next harvest in ${countdown(view.msUntilHarvest)}`}
        value={`${view.harvestsRemaining} left · ${formatToken(remainingYield(view), 'ALLI')}`}
        valueColor={colors.ink2}
      />

      {view.realTreeRef ? (
        <Text variant="caption" color={colors.teal}>
          Paired with a real planting · {view.realTreeRef}
        </Text>
      ) : null}

      {view.harvestable ? (
        <Button
          label={`Harvest ${formatToken(view.seed.yieldAlli, 'ALLI')}`}
          variant={premium ? 'premium' : 'primary'}
          onPress={onHarvest}
        />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.xxl, gap: spacing.md },
  header: { gap: spacing.lg, paddingTop: spacing.lg },
  card: { gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.md },
  plot: { gap: spacing.md },
  plotHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  plotTitle: { flex: 1, gap: 2 },
});
