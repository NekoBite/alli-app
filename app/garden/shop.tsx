import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Card, Pill, Row, Screen, SectionHeader, Text } from '@/components';
import { PREMIUM_SEEDS, STANDARD_SEEDS } from '@/features/garden/catalog';
import { useGardenStore } from '@/features/garden/store';
import type { Seed } from '@/features/garden/types';
import { useWalletStore } from '@/features/wallet/store';
import { colors, spacing } from '@/theme';
import { formatStars, formatToken } from '@/utils/format';

export default function SeedShopScreen() {
  const router = useRouter();
  const plant = useGardenStore((state) => state.plant);
  const balanceOf = useWalletStore((state) => state.balanceOf);
  const [buying, setBuying] = useState<string | null>(null);

  const buy = async (seed: Seed) => {
    const balance = Number(balanceOf(seed.currency)?.formatted ?? 0);
    if (balance < seed.price) {
      Alert.alert(
        'Not enough balance',
        `You need ${formatToken(seed.price, seed.currency)} to plant a ${seed.name}.`,
      );
      return;
    }

    setBuying(seed.id);
    try {
      await plant(seed);
      router.back();
    } catch (error) {
      Alert.alert('Could not plant', (error as Error).message);
    } finally {
      setBuying(null);
    }
  };

  return (
    <Screen>
      <SectionHeader
        title="Standard seeds"
        subtitle="Bought with ALLI · the low-carbon farm: weather, compost, practices"
      />
      {STANDARD_SEEDS.map((seed) => (
        <SeedCard key={seed.id} seed={seed} busy={buying === seed.id} onBuy={() => void buy(seed)} />
      ))}

      <View style={styles.spacer} />

      <SectionHeader
        title="Premium seeds"
        subtitle="Bought with USDT on BNB Chain · simple care, bigger reward and run bonus"
      />
      {PREMIUM_SEEDS.map((seed) => (
        <SeedCard key={seed.id} seed={seed} busy={buying === seed.id} onBuy={() => void buy(seed)} />
      ))}

      <Text variant="caption" color={colors.ink3} style={styles.note}>
        Every tree pays in stars, the same stars the daily run quest pays, and every tree lives
        thirty days. Premium seeds are funded in USDT, so their stars come from the treasury rather
        than from other players.
      </Text>
    </Screen>
  );
}

function SeedCard({ seed, busy, onBuy }: { seed: Seed; busy: boolean; onBuy: () => void }) {
  const premium = seed.tier === 'premium';

  return (
    <Card tone={premium ? 'premium' : 'default'} style={styles.card}>
      <View style={styles.head}>
        <View style={styles.title}>
          <Text variant="bodyStrong">{seed.name}</Text>
          <Text variant="caption" color={colors.ink2}>
            {seed.species}
          </Text>
        </View>
        <Pill label={seed.currency} color={premium ? colors.gold : colors.green} />
      </View>

      <Text variant="body" color={colors.ink2}>
        {seed.blurb}
      </Text>

      <Row
        label="Care"
        value={seed.careProfile === 'lowCarbon' ? 'Low-carbon farm' : 'Simple'}
        valueColor={seed.careProfile === 'lowCarbon' ? colors.teal : colors.ink}
      />
      <Row
        label="Pays per thriving night"
        value={`${formatStars(seed.starsPerDay)} ★`}
        valueColor={colors.gold}
      />
      <Row label="Lives" value={`${seed.lifetimeDays} days`} />
      <Row
        label="Run bonus while thriving"
        value={`+${(seed.runBonus * 100).toFixed(0)}%`}
        valueColor={colors.cyan}
      />
      <Row
        label="Up to"
        value={`${formatStars(seed.starsPerDay * seed.lifetimeDays)} ★ before streak and carbon bonuses`}
        emphasis
      />

      <Button
        label={`Plant · ${formatToken(seed.price, seed.currency)}`}
        variant={premium ? 'premium' : 'primary'}
        loading={busy}
        onPress={onBuy}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, marginBottom: spacing.md },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  title: { flex: 1, gap: 2 },
  spacer: { height: spacing.xl },
  note: { marginTop: spacing.lg },
});
