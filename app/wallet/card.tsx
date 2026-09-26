import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  ListRow,
  Logo,
  Pill,
  Screen,
  ScreenHeader,
  SectionHeader,
  Segmented,
  StatTile,
  Steps,
  Text,
  Toggle,
  toast,
} from '@/components';
import { useAuthStore } from '@/features/auth/store';
import type { CardStatus } from '@/features/wallet/types';
import { useWalletStore } from '@/features/wallet/store';
import { colors, fonts, gradient, radius, spacing } from '@/theme';
import { formatFiat } from '@/utils/format';
import { relativeTime } from '@/utils/time';

/** Where each issuer status sits on the three-step pairing stepper. */
const PAIR_STEP: Record<CardStatus, number> = {
  'not-requested': 0,
  'kyc-required': 0,
  'kyc-pending': 0,
  'kyc-rejected': 0,
  ordered: 1,
  shipped: 2,
  active: 3,
  frozen: 3,
};

const KYC_NOTE: Partial<Record<CardStatus, string>> = {
  'kyc-required': 'Needed before a card can be issued',
  'kyc-pending': 'Documents with the issuer · 1–2 business days',
  'kyc-rejected': 'Not verified — contact support to retry',
};

/** 5.4 ALLI Card — a Visa linked to the ALLI balance. The issuer is mocked for now. */
export default function CardScreen() {
  const { card, cardTransactions, startCardApplication, setCardFrozen, topUpCard, setCardFunding, load } =
    useWalletStore();
  const user = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!card) void load();
  }, [card, load]);

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok, 'ok');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const step = card ? PAIR_STEP[card.status] : 0;
  const funding = card?.fundingToken ?? 'ALLI';
  const holder = (user?.displayName ?? user?.email ?? 'ALLI member').toUpperCase().slice(0, 22);

  const footer = !card ? (
    <Button label="Join the waitlist" loading={busy} onPress={() => void run(startCardApplication, 'You are on the waitlist')} />
  ) : card.status === 'active' ? (
    <Button
      label={`Top up ${formatFiat(25)} · fund with ${funding}`}
      loading={busy}
      disabled={card.frozen}
      onPress={() => void run(() => topUpCard(25, funding), 'Top-up sent — lands once it confirms')}
    />
  ) : (
    <Button label={`Continue · fund with ${funding}`} loading={busy} onPress={() => void run(startCardApplication)} />
  );

  return (
    <Screen footer={footer}>
      <ScreenHeader
        eyebrow="Visa · Roadmap"
        title="ALLI Card"
        back
        right={<Pill label="Coming soon" color={colors.warn} />}
      />

      <LinearGradient
        colors={[gradient.primary[1], gradient.primary[0], colors.redDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.plastic, card?.frozen && styles.frozen]}
        accessibilityLabel={`ALLI Visa card ending ${card?.last4 ?? 'not issued'}`}
      >
        <View style={styles.brand}>
          <Logo size={30} />
          <Text variant="eyebrow" color={colors.ink}>
            ALLI Card
          </Text>
        </View>
        <View style={styles.chip} />
        <Text style={styles.pan}>••••  ••••  ••••  {card?.last4 ?? '····'}</Text>
        <View style={styles.foot}>
          <Text variant="caption" color={colors.ink}>
            {holder}
          </Text>
          <Text style={styles.visa}>VISA</Text>
        </View>
      </LinearGradient>

      <View style={styles.stats}>
        <StatTile label="Available" value={formatFiat(card?.availableUsd ?? 0)} />
        <StatTile label="Funded by" value={funding} color={colors.redHot} />
      </View>

      <Card style={styles.block}>
        <Text variant="label" color={colors.inkFaint}>
          Pair your card
        </Text>
        <Steps
          current={step}
          steps={[
            { title: 'Verify identity', detail: card ? KYC_NOTE[card.status] ?? 'KYC approved' : 'With the issuing partner' },
            { title: 'Choose funding token', detail: 'Spend straight from your balance' },
            { title: 'Activate card', detail: 'Enter the code on the card mailer' },
          ]}
        />
      </Card>

      <Segmented
        options={[
          { value: 'ALLI', label: 'Fund with ALLI' },
          { value: 'USDT', label: 'Fund with USDT' },
        ]}
        value={funding}
        onChange={(t) => void run(() => setCardFunding(t))}
        style={styles.block}
      />

      <View style={styles.freeze}>
        <View style={styles.flex}>
          <Text variant="bodyStrong">Freeze card</Text>
          <Text variant="caption" color={colors.inkDim}>
            Block new payments instantly
          </Text>
        </View>
        <Toggle
          label="Freeze card"
          value={!!card?.frozen}
          disabled={!card || busy}
          onChange={(v) => void run(() => setCardFrozen(v), v ? 'Card frozen' : 'Card unfrozen')}
        />
      </View>

      {cardTransactions.length ? (
        <View style={styles.section}>
          <SectionHeader title="Card activity" />
          <Card style={styles.tight}>
            {cardTransactions.map((tx) => (
              <ListRow
                key={tx.id}
                title={tx.merchant}
                subtitle={`${tx.status} · ${relativeTime(tx.timestamp)}`}
                value={`${tx.status === 'refunded' ? '+' : '−'}${formatFiat(tx.amountUsd)}`}
                valueColor={tx.status === 'refunded' ? colors.ok : colors.ink}
              />
            ))}
          </Card>
        </View>
      ) : null}

      <Text variant="caption" color={colors.inkFaint} style={styles.section}>
        Issued by a licensed partner, not by ALLI. Card number, PIN and statements come from the
        issuer’s secure component, revealed only after a biometric check.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  plastic: { borderRadius: radius.lg, padding: 22, gap: 14, minHeight: 200 },
  frozen: { opacity: 0.45 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  chip: { width: 40, height: 30, borderRadius: 6, backgroundColor: colors.warn, opacity: 0.85 },
  pan: { fontFamily: fonts.monoMedium, fontSize: 18, color: colors.ink, letterSpacing: 1 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  visa: { fontFamily: fonts.display, fontSize: 26, color: colors.ink, fontStyle: 'italic' },
  stats: { flexDirection: 'row', gap: spacing.sm, marginVertical: 14 },
  block: { gap: spacing.md, marginBottom: 14 },
  freeze: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  section: { marginTop: spacing.xl },
  tight: { paddingVertical: 6 },
});
