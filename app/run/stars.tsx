import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Row, Screen, Text } from '@/components';
import { REWARD_RULES, starsToAlli } from '@/features/run/rewards';
import { shoeFor } from '@/features/run/shoes';
import { useRunStore } from '@/features/run/store';
import { useWalletStore } from '@/features/wallet/store';
import { chain } from '@/services/chain';
import { colors, radius, spacing, type } from '@/theme';
import { formatPoints, formatToken, shortAddress } from '@/utils/format';

export default function StarsScreen() {
  const { profile, exchanging, exchangeStars } = useRunStore();
  const account = useWalletStore((state) => state.account);
  const [amount, setAmount] = useState('');

  const parsed = Number(amount);
  const stars = Number.isInteger(parsed) ? parsed : NaN;
  const valid = !Number.isNaN(stars) && stars > 0 && stars <= profile.starsBalance;

  const exchange = async () => {
    if (!account) return;
    try {
      const { alli, txHash } = await exchangeStars(stars, account.address);
      setAmount('');
      Alert.alert('Exchanged', `${formatToken(alli, 'ALLI')} sent.\n\n${txHash}`);
    } catch (error) {
      Alert.alert('Could not exchange', (error as Error).message);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text variant="label" color={colors.ink2}>
          Stars
        </Text>
        <Text variant="hero" color={colors.gold}>
          {profile.starsBalance}
        </Text>
        <Text variant="caption" color={colors.ink2}>
          ≈ {formatToken(starsToAlli(profile.starsBalance), 'ALLI')} · 1 star ={' '}
          {formatToken(REWARD_RULES.alliPerStar, 'ALLI')}
        </Text>
      </View>

      <Card style={styles.card}>
        <Text variant="heading">Exchange stars for ALLI</Text>
        <Text variant="caption" color={colors.ink2}>
          Stars come from the daily quest: {formatPoints(REWARD_RULES.dailyStepGoal)} GPS-verified
          steps in a day pays {REWARD_RULES.starsPerQuest * shoeFor(profile.shoeTier).rewardMultiplier}{' '}
          at your {shoeFor(profile.shoeTier).name} tier.
        </Text>

        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="Stars to exchange"
          placeholderTextColor={colors.ink3}
          keyboardType="number-pad"
          style={styles.input}
          accessibilityLabel="Stars to exchange"
        />
        <Row
          label="Available"
          value={profile.starsBalance.toString()}
          right={
            <Pressable
              accessibilityRole="button"
              onPress={() => setAmount(String(profile.starsBalance))}
              hitSlop={8}
            >
              <Text variant="bodyStrong" color={colors.green}>
                Max
              </Text>
            </Pressable>
          }
        />
        <Row
          label="You receive"
          value={formatToken(starsToAlli(Number.isNaN(stars) ? 0 : stars), 'ALLI')}
          valueColor={colors.green}
          emphasis
        />

        <Button
          label="Exchange"
          size="lg"
          loading={exchanging}
          disabled={!valid || !account}
          onPress={() => void exchange()}
        />
        {!account ? (
          <Text variant="caption" color={colors.warning}>
            No wallet address yet, so there is nowhere for the ALLI to land.
          </Text>
        ) : null}
      </Card>

      <Card style={styles.card} tone="muted">
        <Row label="Network" value={chain.name} />
        <Row
          label="Destination"
          value={account ? shortAddress(account.address) : '—'}
          valueColor={colors.ink2}
        />
        <Text variant="caption" color={colors.ink3}>
          Stars are burned server-side before the transfer is broadcast, and the payout is a
          treasury transfer on BNB Smart Chain — irreversible once sent. ALLI is not deployed yet,
          so a real backend answers this with a 503 rather than pretending.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.xs },
  card: { gap: spacing.sm, marginBottom: spacing.lg },
  input: {
    ...type.body,
    color: colors.ink,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineNeutral,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
