import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button, Card, Pill, Row, Text } from '@/components';
import { colors, radius, spacing } from '@/theme';
import { formatStars, formatToken } from '@/utils/format';
import { countdown } from '@/utils/time';
import { hasMinigame } from '../minigames';
import { CONDITIONS, FERTILISERS, PRACTICES } from '../rules';
import { TreeStage } from '../scene';
import { useGardenStore } from '../store';
import type { Health, PlotView } from '../types';
import { StatusMeters } from './StatusMeters';
import { TapMeter } from './TapMeter';

const HEALTH_LABEL: Record<Health, string> = {
  thriving: 'Thriving',
  stressed: 'Needs care',
  wilting: 'Wilting',
  dead: 'Died',
  retired: 'Retired',
};

const HEALTH_COLOR: Record<Health, string> = {
  thriving: colors.ok,
  stressed: colors.warn,
  wilting: colors.danger,
  dead: colors.inkFaint,
  retired: colors.warn,
};

/** One tree: its stage, its meters, and everything the player can do for it. */
export function TreePage({ view, width }: { view: PlotView; width: number }) {
  const router = useRouter();
  const { tap, water, fertilise, claim, busy, tapsFor } = useGardenStore();
  const taps = useGardenStore((state) => state.taps);
  const [popped, setPopped] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const claiming = useRef(false);

  const tapCount = tapsFor(view.id);
  void taps; // subscribe, so the meter follows each tap
  const tendable = view.health !== 'dead' && view.health !== 'retired';
  const lowCarbon = view.seed.careProfile === 'lowCarbon';

  const say = (message: string) => {
    setFlash(message);
    setTimeout(() => setFlash((current) => (current === message ? null : current)), 2500);
  };

  const onTapTree = () => {
    if (!tendable) return;
    tap(view.id).catch((error: Error) => say(error.message));
  };

  const onTapSparkle = () => {
    setPopped((count) => count + 1);
    if (claiming.current) return;
    claiming.current = true;
    claim(view.id)
      .then((stars) => say(`Collected ${formatStars(stars)} ★`))
      .catch((error: Error) => say(error.message))
      .finally(() => {
        // Settled either way: on success the store now holds no sparkles, on
        // failure they come back, so nothing stays hidden by hand.
        claiming.current = false;
        setPopped(0);
      });
  };

  const onWater = () => water(view.id).catch((error: Error) => Alert.alert('Could not water', error.message));

  const onFertilise = () => {
    if (!lowCarbon) {
      const rule = FERTILISERS.stars;
      Alert.alert('Fertilise', `${rule.blurb}`, [
        {
          text: `Fertiliser · ${formatStars(rule.priceStars ?? 0)} ★`,
          onPress: () =>
            fertilise(view.id, 'stars').catch((error: Error) =>
              Alert.alert('Could not fertilise', error.message),
            ),
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    const compost = FERTILISERS.compost;
    const synthetic = FERTILISERS.synthetic;
    Alert.alert('Fertilise', 'Compost is free and lowers your carbon score. Synthetic is instant and raises it.', [
      {
        text: `Compost · ${view.compost.ready} ready`,
        onPress: () =>
          fertilise(view.id, 'compost').catch((error: Error) =>
            Alert.alert(compost.label, `${error.message} ${compost.blurb}`),
          ),
      },
      {
        text: `Synthetic · ${formatToken(synthetic.priceAlli ?? 0, 'ALLI')}`,
        onPress: () =>
          fertilise(view.id, 'synthetic').catch((error: Error) =>
            Alert.alert('Could not fertilise', error.message),
          ),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const openMinigame = (game: string) =>
    router.push({ pathname: '/garden/minigame/[game]', params: { game, plotId: view.id } });

  const condition = view.activeConditions[0];
  const conditionRule = condition ? CONDITIONS[condition] : undefined;
  const conditionGame =
    conditionRule?.minigame && hasMinigame(conditionRule.minigame) ? conditionRule.minigame : undefined;

  const stageLabel = view.stage[0]!.toUpperCase() + view.stage.slice(1);
  const openDetail = () => router.push({ pathname: '/garden/plot/[id]', params: { id: view.id } });

  return (
    <ScrollView style={{ width }} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.stage}>
        <TreeStage view={view} popped={popped} onTapTree={onTapTree} onTapSparkle={onTapSparkle} />
      </View>

      <View style={styles.head}>
        <Pressable accessibilityRole="button" onPress={openDetail} style={styles.title}>
          <Text variant="heading" style={styles.name}>
            {view.seed.name} · {stageLabel}
          </Text>
          <Text variant="caption" color={colors.inkDim}>
            Day {Math.floor(view.ageDays) + 1} of {view.seed.lifetimeDays} ·{' '}
            <Text variant="caption" color={HEALTH_COLOR[view.health]}>
              {HEALTH_LABEL[view.health].toLowerCase()}
            </Text>
          </Text>
        </Pressable>
        {view.claimableStars > 0 ? (
          <Button label={`Collect ${formatStars(view.claimableStars)} ★`} size="sm" onPress={onTapSparkle} />
        ) : (
          <Pill label={HEALTH_LABEL[view.health]} color={HEALTH_COLOR[view.health]} />
        )}
      </View>

      <View style={styles.flashRow}>
        {flash ? (
          <Pill label={flash} color={colors.warn} />
        ) : !tendable ? (
          <Text variant="caption" color={colors.inkDim}>
            {view.health === 'dead'
              ? 'This tree has died. Plant a new seed to keep the garden going.'
              : 'This tree has lived its thirty days. Plant a new seed.'}
          </Text>
        ) : (
          <Text variant="mono" color={colors.inkFaint}>
            Stay above every line tonight to earn {formatStars(view.nextReward)} ★
          </Text>
        )}
      </View>

      {tendable ? (
        <>
          <Card style={styles.card}>
            <StatusMeters meters={view.meters} />
          </Card>

          <View style={styles.toolbar}>
            <Button
              label="Water"
              variant="secondary"
              loading={busy === view.id}
              onPress={() => void onWater()}
              style={styles.tool}
            />
            <Button
              label={view.sunFilledToday ? 'Sun ✓' : 'Sun'}
              variant="secondary"
              disabled={busy === view.id || view.sunFilledToday}
              onPress={onTapTree}
              style={styles.tool}
            />
            <Button
              label={lowCarbon ? 'Compost' : 'Feed'}
              variant="secondary"
              disabled={busy === view.id}
              onPress={onFertilise}
              style={styles.tool}
            />
          </View>

          <Card style={styles.card}>
            <TapMeter
              taps={tapCount}
              needed={view.sunTapsNeeded}
              filled={view.sunFilledToday}
              note={
                condition && conditionRule?.sunTapsFactor
                  ? `${conditionRule.label}: the sun is weaker, so today needs ${view.sunTapsNeeded} taps.`
                  : undefined
              }
            />
          </Card>

          {lowCarbon ? (
            <Card style={styles.card}>
              <Row
                label="Compost"
                value={
                  view.compost.maturing
                    ? `Heap matures in ${countdown(view.compost.msUntilMature)}`
                    : `${view.compost.ready} ready`
                }
                valueColor={view.compost.ready > 0 ? colors.ok : colors.inkDim}
              />
              <Row
                label="Practices"
                value={view.practices.length ? view.practices.map((id) => PRACTICES[id].label).join(', ') : 'None yet'}
                valueColor={view.practices.length ? colors.ok : colors.inkDim}
              />
              <Row
                label="Carbon multiplier"
                value={`×${view.carbonMultiplier.toFixed(2)}`}
                valueColor={view.carbonMultiplier >= 1 ? colors.ok : colors.warn}
              />
              <Button
                label="Gather compost"
                variant="secondary"
                size="sm"
                disabled={busy === view.id || view.compost.maturing}
                onPress={() => openMinigame('compost')}
              />
              {conditionRule ? (
                <View style={styles.condition}>
                  <Text variant="bodyStrong" color={colors.warn}>
                    {conditionRule.label}
                  </Text>
                  <Text variant="caption" color={colors.inkDim}>
                    {conditionRule.lesson}
                  </Text>
                  {conditionGame ? (
                    <Button
                      label={`Play: ${PRACTICES[conditionRule.counteredBy].label}`}
                      variant="ghost"
                      onPress={() => openMinigame(conditionGame)}
                    />
                  ) : (
                    <Text variant="caption" color={colors.inkFaint}>
                      Countered by {PRACTICES[conditionRule.counteredBy].label}. That minigame is
                      not built yet, so for now: keep the meters up the hard way.
                    </Text>
                  )}
                </View>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : (
        <Button label="Open the seed shop" onPress={() => router.push('/garden/shop')} />
      )}

      <Button label="Tree details →" variant="ghost" onPress={openDetail} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: spacing.gutter, paddingBottom: spacing.xxl, gap: spacing.md },
  stage: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  title: { flex: 1, gap: 2 },
  name: { fontSize: 17 },
  flashRow: { minHeight: 24, alignItems: 'center' },
  card: { gap: spacing.sm },
  toolbar: { flexDirection: 'row', gap: spacing.sm },
  tool: { flex: 1 },
  condition: { gap: spacing.xs, paddingTop: spacing.sm },
});
