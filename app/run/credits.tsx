import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  ConfirmSheet,
  Pill,
  ProgressBar,
  Screen,
  ScreenHeader,
  SectionHeader,
  Segmented,
  Text,
  toast,
} from '@/components';
import {
  checkPurchase,
  MEMBERSHIP_PRICE_ALLI,
  packPrice,
  RUN_PACKS,
  type PayCurrency,
  type RunPack,
} from '@/features/run/credits';
import { useRunStore } from '@/features/run/store';
import { useWalletStore } from '@/features/wallet/store';
import { colors, radius, spacing } from '@/theme';
import { formatToken } from '@/utils/format';
import { formatDate } from '@/utils/time';

/** 2.5 Run credits — membership plus one-off packs, paid in ALLI or BSC USDT. */
export default function RunCreditsScreen() {
  const { entitlement, buying, renewing, buyRuns, renewMembership } = useRunStore();
  const balanceOf = useWalletStore((s) => s.balanceOf);
  const walletLoaded = useWalletStore((s) => s.balances.length > 0);
  const loadWallet = useWalletStore((s) => s.load);
  useEffect(() => {
    if (!walletLoaded) void loadWallet();
  }, [walletLoaded, loadWallet]);
  const [selected, setSelected] = useState<RunPack>(RUN_PACKS[1]);
  const [currency, setCurrency] = useState<PayCurrency>('ALLI');
  const [confirm, setConfirm] = useState<'pack' | 'renew' | null>(null);

  const membership = entitlement.membership;
  const active = membership.status === 'active';
  const used = Math.min(entitlement.runsThisMonth, membership.runsPerRenewal);
  const price = packPrice(selected, currency);
  const renewPrice = currency === 'ALLI' ? MEMBERSHIP_PRICE_ALLI : membership.priceUsdt;
  const balance = Number(balanceOf(currency)?.formatted ?? 0);
  const check = checkPurchase(selected.runs, entitlement);
  const shortOf = (amount: number) => balance < amount;

  const onBuy = async () => {
    try {
      if (confirm === 'renew') {
        await renewMembership(currency);
        toast(`Membership renewed · +${membership.runsPerRenewal} runs`, 'ok');
      } else {
        await buyRuns(selected.runs, currency);
        toast(`${selected.runs} runs added`, 'ok');
      }
      setConfirm(null);
      router.back();
    } catch (error) {
      setConfirm(null);
      toast((error as Error).message, 'error');
    }
  };

  const cta = shortOf(price)
    ? { label: `Top up ${currency}`, onPress: () => router.push('/wallet/receive') }
    : { label: `Buy ${selected.runs} runs · ${formatToken(price)} ${currency}`, onPress: () => setConfirm('pack') };

  return (
    <Screen
      footer={
        <>
          <Button label={cta.label} onPress={cta.onPress} disabled={!check.ok && !shortOf(price)} />
          {!check.ok && check.reason ? (
            <Text variant="caption" color={colors.warn} center>
              {check.reason}
            </Text>
          ) : null}
        </>
      }
    >
      <ScreenHeader eyebrow="1 run = 1 credit" title="Run credits" back />

      <Card tone="hero" style={styles.gap}>
        <View style={styles.rowBetween}>
          <Text variant="label" color={colors.redHot}>
            Monthly membership
          </Text>
          <Pill
            label={active ? 'Active' : membership.status === 'expired' ? 'Expired' : 'None'}
            color={active ? colors.ok : colors.warn}
          />
        </View>
        <Text variant="heading">{membership.runsPerRenewal} runs / month</Text>
        <Text variant="caption" color={colors.inkDim}>
          {membership.activeUntil
            ? `${active ? 'Renews' : 'Lapsed'} ${formatDate(membership.activeUntil)} · `
            : ''}
          {used} of {membership.runsPerRenewal} used · {entitlement.runsLeft} left
        </Text>
        <ProgressBar progress={used / membership.runsPerRenewal} height={4} />
        <Button
          label={`${active ? 'Renew early' : 'Renew'} · ${formatToken(renewPrice)} ${currency}`}
          variant="secondary"
          loading={renewing}
          onPress={() => (shortOf(renewPrice) ? router.push('/wallet/receive') : setConfirm('renew'))}
        />
      </Card>

      <View style={styles.section}>
        <SectionHeader title="Buy runs outright" />
        <View style={styles.packs}>
          {RUN_PACKS.map((pack) => {
            const on = pack.runs === selected.runs;
            const p = packPrice(pack, currency);
            return (
              <Pressable
                key={pack.runs}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                onPress={() => setSelected(pack)}
                style={[styles.pack, on && styles.packOn]}
              >
                <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                <View style={styles.flex}>
                  <View style={styles.packTitle}>
                    <Text variant="bodyStrong">{pack.runs} runs</Text>
                    {'bestValue' in pack && pack.bestValue ? <Pill label="Best value" color={colors.ok} /> : null}
                  </View>
                  <Text variant="caption" color={colors.inkDim}>
                    {formatToken(p / pack.runs)} {currency} / run
                  </Text>
                </View>
                <Text variant="figure" style={styles.packPrice} color={shortOf(p) ? colors.warn : colors.ink}>
                  {formatToken(p)} {currency}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Segmented
        options={[
          { value: 'ALLI', label: 'Pay with ALLI' },
          { value: 'USDT', label: 'Pay with USDT' },
        ]}
        value={currency}
        onChange={setCurrency}
      />
      <View style={styles.balance}>
        <Text variant="caption" color={colors.inkDim}>
          Wallet balance
        </Text>
        <Text variant="monoStrong" color={shortOf(price) ? colors.warn : colors.ink}>
          {formatToken(balance)} {currency}
        </Text>
      </View>

      <ConfirmSheet
        visible={confirm !== null}
        title={confirm === 'renew' ? 'Renew membership' : `Buy ${selected.runs} runs`}
        lines={[
          { label: 'Pay with', value: currency },
          { label: 'Runs added', value: String(confirm === 'renew' ? membership.runsPerRenewal : selected.runs) },
          { label: 'Network fee', value: '≈ 0.0004 BNB' },
        ]}
        total={{ label: 'You pay', value: `${formatToken(confirm === 'renew' ? renewPrice : price)} ${currency}` }}
        note="The price is quoted by the server and bound into the signed payment. Credits land once the transfer confirms."
        confirmLabel="Sign & pay"
        busy={buying || renewing}
        onConfirm={() => void onBuy()}
        onCancel={() => setConfirm(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { marginTop: spacing.xl, marginBottom: spacing.lg },
  packs: { gap: 10 },
  pack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
  },
  packOn: { borderColor: colors.redHot, backgroundColor: colors.raised2 },
  packTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  packPrice: { fontSize: 15 },
  radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: colors.inkFaint, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.redHot, backgroundColor: colors.redHot },
  radioDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.bg },
  balance: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
});
