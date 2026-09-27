import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';

import { Button, Card, InviteBanner, Pill, Screen, ScreenHeader, Text } from '@/components';
import { useGardenStore } from '@/features/garden/store';
import { useQuestStore } from '@/features/quests/store';
import { WeeklyQuestStrip } from '@/features/quests/ui';
import type { PlotView } from '@/features/garden/types';
import { TreePage } from '@/features/garden/ui';
import { colors, spacing } from '@/theme';

type Page = { key: string; view?: PlotView };

const VIEWABILITY = { itemVisiblePercentThreshold: 60 };

/** Sparkles first, then trees in trouble, then the rest; the dead and retired last. */
function rank(view: PlotView): number {
  if (view.claimableStars > 0) return 0;
  if (view.health === 'wilting') return 1;
  if (view.health === 'stressed') return 2;
  if (view.health === 'thriving') return 3;
  return 4;
}

export default function GardenScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { refresh, views, carbon, error } = useGardenStore();
  const garden = useGardenStore((state) => state.garden);
  const quest = useQuestStore((state) => state.snapshot);
  const refreshQuest = useQuestStore((state) => state.refresh);
  const [tick, setTick] = useState(0);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    void refresh();
    void refreshQuest();
  }, [refresh, refreshQuest]);

  // Re-project once a minute so the meters are seen to fall.
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  // `garden` and `tick` are what change the projection.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const current = useMemo(() => views(), [views, garden, tick]);
  const idsKey = current
    .map((v) => v.id)
    .sort()
    .join('|');

  // Sort by need only when the set of trees changes, so a page does not jump
  // out from under the player the moment they collect its sparkles.
  const order = useMemo(
    () =>
      [...current]
        .sort((a, b) => rank(a) - rank(b) || b.plantedAt - a.plantedAt)
        .map((v) => v.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [idsKey],
  );

  const pages = useMemo<Page[]>(() => {
    const byId = new Map(current.map((v) => [v.id, v]));
    const trees = order
      .map((id) => byId.get(id))
      .filter((v): v is PlotView => v !== undefined)
      .map((view) => ({ key: view.id, view }));
    return [...trees, { key: 'plant' }];
  }, [order, current]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first && typeof first.index === 'number') setIndex(first.index);
  }, []);

  const thriving = pages.filter((p) => p.view?.health === 'thriving').length;
  const { score, multiplier } = carbon();

  return (
    <Screen inTabs scroll={false} style={styles.screen}>
      <View style={styles.top}>
        <ScreenHeader eyebrow="Plant to earn" title="Garden" right={<Pill label="Beta" />} />
        <InviteBanner
          title="Invite gardeners"
          subtitle="20% of their seed purchases"
          href="/referrals/garden"
        />
      </View>
      <View style={styles.header}>
        <Text variant="caption" color={colors.inkDim}>
          {pages.length - 1} {pages.length - 1 === 1 ? 'tree' : 'trees'} · {thriving} thriving
        </Text>
        <Pill
          label={`Carbon ${score > 0 ? '+' : ''}${score} · ${multiplier.toFixed(2)}×`}
          color={score <= 0 ? colors.ok : colors.warn}
        />
      </View>
      {error ? (
        <Text variant="caption" color={colors.danger} style={styles.error}>
          {error}
        </Text>
      ) : null}
      {quest ? <WeeklyQuestStrip snapshot={quest} onOpen={() => router.push('/quests/weekly')} /> : null}

      <FlatList
        data={pages}
        keyExtractor={(page) => page.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY}
        renderItem={({ item }) =>
          item.view ? (
            <TreePage view={item.view} width={width} />
          ) : (
            <PlantPage width={width} onPlant={() => router.push('/garden/shop')} first={pages.length === 1} />
          )
        }
      />

      <View style={styles.dots} accessibilityLabel={`Page ${index + 1} of ${pages.length}`}>
        {pages.map((page, i) => (
          <View key={page.key} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </Screen>
  );
}

function PlantPage({ width, onPlant, first }: { width: number; onPlant: () => void; first: boolean }) {
  return (
    <View style={[styles.plantPage, { width }]}>
      <Card style={styles.plantCard}>
        <Text variant="title" center>
          {first ? 'Your garden is empty' : 'Plant another'}
        </Text>
        <Text variant="body" color={colors.inkDim} center>
          A tree lives thirty days. Keep its water, sun and soil above the line and every night
          leaves stars on its branches.
        </Text>
        <Text variant="caption" color={colors.inkFaint} center>
          ALLI seeds play the low-carbon farm: weather moves the lines, compost is gathered, and
          how you farm sets the multiplier. USDT seeds keep it simple.
        </Text>
        <Button label="Open the seed shop" onPress={onPlant} />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  top: { paddingHorizontal: spacing.gutter, marginBottom: spacing.sm },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
  },
  error: { paddingHorizontal: spacing.gutter },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.inkFaint },
  dotActive: { backgroundColor: colors.redHot, width: 18 },
  plantPage: { paddingHorizontal: spacing.gutter, paddingTop: spacing.xl },
  plantCard: { gap: spacing.md },
});
