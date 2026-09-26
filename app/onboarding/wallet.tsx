import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Gradient, IconTile, Pill, Screen, Text, toast } from '@/components';
import { useAuthStore } from '@/features/auth/store';
import { SHOE_ORDER, SHOES } from '@/features/run/shoes';
import { useWalletStore } from '@/features/wallet/store';
import { colors, fonts, spacing } from '@/theme';
import { shortAddress } from '@/utils/format';

/** 1.3 Wallet ready — shown once, straight after the sign-in that created the account. */
export default function WalletReadyScreen() {
  const account = useWalletStore((s) => s.account);
  const load = useWalletStore((s) => s.load);
  const finish = useAuthStore((s) => s.finishOnboarding);

  useEffect(() => {
    if (!account) void load();
  }, [account, load]);

  const copy = async () => {
    if (!account) return;
    await Clipboard.setStringAsync(account.address);
    toast('Address copied', 'ok');
  };

  const leather = SHOES.leather;
  const top = SHOES[SHOE_ORDER[SHOE_ORDER.length - 1] ?? 'leather'];

  const done = (backup: boolean) => {
    finish();
    // Leaving the protected group swaps the stack to the tabs; the wallet tab carries the
    // recovery-phrase banner until a backup is confirmed.
    if (backup) setTimeout(() => router.push('/(tabs)/wallet'), 0);
  };

  return (
    <Screen
      footer={
        <View style={styles.pair}>
          <Button label="Back up now" variant="secondary" onPress={() => done(true)} style={styles.flex} />
          <Button label="Let’s go" onPress={() => done(false)} style={styles.flex} />
        </View>
      }
    >
      <View style={styles.hero}>
        <Gradient style={styles.check}>
          <Text style={styles.checkMark} color={colors.onRed}>
            ✓
          </Text>
        </Gradient>
        <Text variant="title" center>
          Your wallet is ready
        </Text>
        <Text variant="body" color={colors.inkDim} center>
          We created a BNB Smart Chain wallet for you. Keys are held in this device’s secure
          keychain.
        </Text>
      </View>

      <Card tone="hero" style={styles.block}>
        <Text variant="label" color={colors.inkFaint}>
          Wallet address
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Copy wallet address"
          onPress={() => void copy()}
          style={styles.addressRow}
        >
          <Text style={styles.address}>{account ? shortAddress(account.address, 6, 4) : '…'}</Text>
          <Pill label="Copy" color={colors.inkDim} />
        </Pressable>
      </Card>

      <Card tone="hero" style={styles.block}>
        <Text variant="label" color={colors.redHot}>
          Welcome gift
        </Text>
        <View style={styles.gift}>
          <IconTile glyph="L" size={48} />
          <View style={styles.flex}>
            <Text variant="bodyStrong" style={styles.giftTitle}>
              {leather.name} NFT shoe
            </Text>
            <Text variant="caption" color={colors.inkDim}>
              ×{leather.rewardMultiplier.toFixed(1)} reward multiplier · Tier 1 of {SHOE_ORDER.length}
            </Text>
          </View>
          <Pill label="Free" color={colors.ok} />
        </View>
        <Text variant="caption" color={colors.inkFaint}>
          Higher tiers multiply the daily reward up to {top.rewardMultiplier}×.
        </Text>
      </Card>

      <Card tone="warn" style={styles.notice}>
        <Text variant="bodyStrong" color={colors.warn}>
          !
        </Text>
        <Text variant="caption" color={colors.inkDim} style={styles.flex}>
          Back up your recovery phrase before you hold real value. Lose the phone, lose the wallet.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: 'center', gap: spacing.md, marginTop: spacing.xxl, marginBottom: spacing.xl },
  check: { width: 76, height: 76, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  checkMark: { fontSize: 38, lineHeight: 44, fontFamily: fonts.display },
  block: { gap: spacing.sm, marginBottom: spacing.md },
  addressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  address: { fontFamily: fonts.monoMedium, fontSize: 17, color: colors.ink },
  gift: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  giftTitle: { fontSize: 17 },
  notice: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  pair: { flexDirection: 'row', gap: 10 },
});
