import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Button,
  ConfirmSheet,
  IconTile,
  Screen,
  ScreenHeader,
  Segmented,
  Text,
  toast,
} from '@/components';
import { PREMIUM_SEEDS, STANDARD_SEEDS } from '@/features/garden/catalog';
import { useGardenStore } from '@/features/garden/store';
import type { Seed } from '@/features/garden/types';
import { useWalletStore } from '@/features/wallet/store';
import { colors, radius, spacing } from '@/theme';
import { formatStars, formatToken } from '@/utils/format';

type Catalogue = 'standard' | 'premium';

/** 3.2 Seed shop — ALLI seeds (the low-carbon farm) and Premium seeds bought with BSC USDT. */
export default function SeedShopScreen() {
  const router = useRouter();
  const plant = useGardenStore((state) => state.plant);
  const { balanceOf, balances, load } = useWalletStore();
  const [catalogue, setCatalogue] = useState<Catalogue>('standard');
  const seeds = catalogue === 'standard' ? STANDARD_SEEDS : PREMIUM_SEEDS;
  const [selectedId, setSelectedId] = useState<string>(STANDARD_SEEDS[0]?.id ?? '');
  const [confirm, setConfirm] = useState(false);
  const [buying, setBuying] = useState(false);

  useEffect(() => {
    if (balances.length === 0) void load();
  }, [balances.length, load]);

  const selected = seeds.find((s) => s.id === selectedId) ?? seeds[0];
  const balance = (seed: Seed) => Number(balanceOf(seed.currency)?.formatted ?? 0);
  const affordable = (seed: Seed) => balance(seed) >= seed.price;

  const switchTo = (next: Catalogue) => {
    setCatalogue(next);
    setSelectedId((next === 'standard' ? STANDARD_SEEDS : PREMIUM_SEEDS)[0]?.id ?? '');
  };

  const buy = async () => {
    if (!selected) return;
    setBuying(true);
    try {
      const plot = await plant(selected);
      setConfirm(false);
      toast(`${selected.name} planted`, 'ok');
      router.replace({ pathname: '/garden/plot/[id]', params: { id: plot.id } });
    } catch (error) {
      setConfirm(false);
      toast((error as Error).message, 'error');
    } finally {
      setBuying(false);
    }
  };

  const footer = selected ? (
    <>
      <View style={styles.balance}>
        <Text variant="caption" color={colors.inkDim}>
          Balance
        </Text>
        <Text variant="monoStrong" color={affordable(selected) ? colors.ink : colors.warn}>
          {formatToken(balance(selected))} {selected.currency}
        </Text>
      </View>
      {affordable(selected) ? (
        <Button
          label={`Plant ${selected.name} · ${formatToken(selected.price)} ${selected.currency}`}
          onPress={() => setConfirm(true)}
        />
      ) : (
        <Button label={`Top up ${selected.currency}`} onPress={() => router.push('/wallet/receive')} />
      )}
    </>
  ) : null;

  return (
    <Screen footer={footer}>
      <ScreenHeader eyebrow="Plant to earn" title="Seed shop" back />

      <Segmented
        options={[
          { value: 'standard', label: 'ALLI seeds' },
          { value: 'premium', label: 'Premium · USDT' },
        ]}
        value={catalogue}
        onChange={switchTo}
      />
      <Text variant="caption" color={colors.inkDim} style={styles.intro}>
        {catalogue === 'standard'
          ? 'ALLI seeds play the low-carbon farm: minigames earn compost and practices that keep your tree healthy.'
          : 'Premium seeds are bought with BSC USDT: a simpler loop — no weather, bought fertiliser — and a higher payout.'}
      </Text>

      <View style={styles.grid}>
        {seeds.map((seed) => {
          const on = seed.id === selected?.id;
          const can = affordable(seed);
          return (
            <Pressable
              key={seed.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${seed.name}, ${formatToken(seed.price)} ${seed.currency}`}
              onPress={() => setSelectedId(seed.id)}
              style={[styles.seed, on && styles.seedOn]}
            >
              <IconTile glyph={seed.name[0] ?? '?'} size={42} />
              <Text variant="bodyStrong" style={styles.seedName} numberOfLines={1}>
                {seed.name.replace(' (Premium)', '')}
              </Text>
              <Text variant="mono" color={colors.inkDim}>
                ≈ {formatStars(seed.starsPerDay)} ★ / night
              </Text>
              <Text variant="mono" color={colors.inkFaint} style={styles.small}>
                {seed.lifetimeDays} days to grow
              </Text>
              <Text variant="figure" color={on ? colors.redHot : can ? colors.ink : colors.warn} style={styles.price}>
                {formatToken(seed.price)} {seed.currency}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {selected ? (
        <Text variant="caption" color={colors.inkFaint} style={styles.intro}>
          {selected.blurb} Up to {formatStars(selected.starsPerDay * selected.lifetimeDays)} ★ over its
          life before streak and carbon bonuses; +{Math.round(selected.runBonus * 100)}% on the run
          quest while it thrives.
        </Text>
      ) : null}

      {selected ? (
        <ConfirmSheet
          visible={confirm}
          title={`Plant ${selected.name}`}
          lines={[
            { label: 'Seed', value: selected.name },
            { label: 'Care', value: selected.careProfile === 'lowCarbon' ? 'Low-carbon farm' : 'Simple' },
            { label: 'Lives', value: `${selected.lifetimeDays} days` },
            { label: 'Network fee', value: '≈ 0.0004 BNB' },
          ]}
          total={{ label: 'You pay', value: `${formatToken(selected.price)} ${selected.currency}` }}
          note="A BEP-20 payment to the ALLI payment router. The tree is planted once the transfer confirms."
          confirmLabel="Sign & plant"
          busy={buying}
          onConfirm={() => void buy()}
          onCancel={() => setConfirm(false)}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginVertical: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  seed: {
    width: '48.4%',
    gap: 6,
    padding: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
  },
  seedOn: { borderColor: colors.redHot, backgroundColor: colors.raised2 },
  seedName: { marginTop: 6, fontSize: 16 },
  small: { fontSize: 11 },
  price: { marginTop: 6 },
  balance: { flexDirection: 'row', justifyContent: 'space-between' },
});
