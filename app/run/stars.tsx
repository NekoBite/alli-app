import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import {
  Button,
  Card,
  Chips,
  KeyValueCard,
  Pill,
  Screen,
  ScreenHeader,
  Text,
  toast,
} from '@/components';
import { starsToAlli } from '@/features/run/rewards';
import { useRunStore } from '@/features/run/store';
import { useWalletStore } from '@/features/wallet/store';
import { colors, fonts, spacing } from '@/theme';
import { formatStars, formatToken } from '@/utils/format';

type Preset = '25' | '50' | 'max';

/** 2.6 Exchange stars — stars to ALLI at the published rate; the server signs the payout. */
export default function StarsScreen() {
  const { profile, exchanging, exchangeStars } = useRunStore();
  const account = useWalletStore((state) => state.account);
  const loadWallet = useWalletStore((state) => state.load);
  const [amount, setAmount] = useState('');
  const [preset, setPreset] = useState<Preset | null>(null);

  useEffect(() => {
    if (!account) void loadWallet();
  }, [account, loadWallet]);

  const balance = Math.floor(profile.starsBalance);
  const stars = Number(amount);
  const whole = Number.isInteger(stars) && stars > 0;
  const error = !amount
    ? null
    : !whole
      ? 'Exchange whole stars.'
      : stars > profile.starsBalance
        ? `You hold ${formatStars(profile.starsBalance)} ★.`
        : null;

  const pick = (p: Preset) => {
    setPreset(p);
    const n = p === 'max' ? balance : Math.floor((balance * Number(p)) / 100);
    setAmount(n > 0 ? String(n) : '');
  };

  const exchange = async () => {
    if (!account) return;
    try {
      const { alli } = await exchangeStars(stars, account.address);
      toast(`${formatToken(alli, 'ALLI')} on its way to your wallet`, 'ok');
      router.replace('/(tabs)/wallet');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  return (
    <Screen
      footer={
        <>
          <Button
            label={whole && !error ? `Exchange ${formatStars(stars)} ★` : 'Exchange'}
            loading={exchanging}
            disabled={!whole || !!error || !account}
            onPress={() => void exchange()}
          />
          {!account ? (
            <Text variant="caption" color={colors.warn} center>
              No wallet address yet, so there is nowhere for the ALLI to land.
            </Text>
          ) : null}
        </>
      }
    >
      <ScreenHeader eyebrow="Stars → ALLI" title="Exchange stars" back />

      <Card style={styles.gap}>
        <View style={styles.rowBetween}>
          <Text variant="label" color={colors.inkFaint}>
            You exchange
          </Text>
          <Text variant="mono" color={colors.inkFaint}>
            Balance {formatStars(profile.starsBalance)} ★
          </Text>
        </View>
        <View style={styles.rowBetween}>
          <TextInput
            value={amount}
            onChangeText={(t) => {
              setPreset(null);
              setAmount(t.replace(/[^\d]/g, ''));
            }}
            placeholder="0"
            placeholderTextColor={colors.inkFaint}
            keyboardType="number-pad"
            style={styles.amount}
            accessibilityLabel="Stars to exchange"
          />
          <Pill label="★ Stars" color={colors.inkDim} />
        </View>
        <Chips
          options={[
            { value: '25', label: '25%' },
            { value: '50', label: '50%' },
            { value: 'max', label: 'Max' },
          ]}
          value={preset}
          onChange={pick}
        />
        {error ? (
          <Text variant="caption" color={colors.warn}>
            {error}
          </Text>
        ) : null}
      </Card>

      <View style={styles.arrowWrap}>
        <View style={styles.arrow}>
          <Text variant="bodyStrong" color={colors.redHot}>
            ↓
          </Text>
        </View>
      </View>

      <Card tone="hero" style={styles.gap}>
        <Text variant="label" color={colors.inkFaint}>
          You receive
        </Text>
        <View style={styles.rowBetween}>
          <Text style={[styles.amount, styles.receive]} numberOfLines={1}>
            {formatToken(starsToAlli(whole ? stars : 0))}
          </Text>
          <Pill label="ALLI" />
        </View>
      </Card>

      <View style={styles.details}>
        <KeyValueCard
          lines={[
            { label: 'Rate', value: `1 ★ = ${formatToken(starsToAlli(1))} ALLI` },
            { label: 'Network fee', value: 'Covered by ALLI' },
            { label: 'Arrives', value: 'Wallet · after confirmation' },
          ]}
        />
      </View>
      <Text variant="caption" color={colors.inkFaint} style={styles.note}>
        Stars are burned first; the server then signs a one-time voucher and the RewardClaim contract
        pays the ALLI. The transfer shows in Wallet activity.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { gap: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  amount: { flex: 1, fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.ink, padding: 0 },
  receive: { color: colors.redHot },
  arrowWrap: { alignItems: 'center', marginVertical: -6, zIndex: 1 },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: { marginTop: 14 },
  note: { marginTop: spacing.md },
});
