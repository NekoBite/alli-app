import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Card, Pill, Row, Screen, SectionHeader, Text } from '@/components';
import type { CardStatus } from '@/features/wallet/types';
import { useWalletStore } from '@/features/wallet/store';
import { colors, radius, spacing } from '@/theme';
import { formatFiat } from '@/utils/format';
import { relativeTime } from '@/utils/time';

const STATUS_COPY: Record<CardStatus, string> = {
  'not-requested': 'Not applied for yet.',
  'kyc-required': 'Identity verification is needed before a card can be issued.',
  'kyc-pending': 'Your documents are with the issuer. This usually takes 1–2 business days.',
  'kyc-rejected': 'The issuer could not verify your identity. Contact support to retry.',
  ordered: 'Approved. Your physical card is being produced.',
  shipped: 'Your card is on its way.',
  active: 'Active and ready to spend.',
  frozen: 'Frozen. No new authorizations will go through.',
};

export default function CardScreen() {
  const { card, cardTransactions, startCardApplication, setCardFrozen, topUpCard } =
    useWalletStore();
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    setBusy(true);
    try {
      await startCardApplication();
      Alert.alert(
        'Application started',
        'You will be handed to the issuing partner to complete identity verification.',
      );
    } catch (error) {
      Alert.alert('Could not apply', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleFreeze = async () => {
    if (!card) return;
    setBusy(true);
    try {
      await setCardFrozen(!card.frozen);
    } catch (error) {
      Alert.alert('Could not update card', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const topUp = async () => {
    if (!card) return;
    setBusy(true);
    try {
      await topUpCard(25, card.fundingToken);
      Alert.alert('Top-up sent', 'Funds land on the card once the transfer confirms.');
    } catch (error) {
      Alert.alert('Could not top up', (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!card) {
    return (
      <Screen>
        <SectionHeader title="Visa card" subtitle="Spend your balance anywhere Visa is accepted" />
        <Card tone="premium" style={styles.card}>
          <Text variant="body" color={colors.ink2}>
            A card is issued by a licensed partner, not by Alli. Applying starts identity
            verification with them; Alli never sees your documents or the full card number.
          </Text>
        </Card>
        <Button label="Apply for a card" size="lg" variant="premium" loading={busy} onPress={() => void apply()} />
      </Screen>
    );
  }

  const usable = card.status === 'active' && !card.frozen;

  return (
    <Screen>
      <View style={[styles.plastic, card.frozen && styles.plasticFrozen]}>
        <Text variant="label" color={colors.onGold}>
          Alli · Visa
        </Text>
        <Text variant="title" color={colors.onGold} style={styles.pan}>
          •••• •••• •••• {card.last4 ?? '----'}
        </Text>
        <View style={styles.plasticFoot}>
          <Text variant="caption" color={colors.onGold}>
            Exp {card.expiry ?? '--/--'}
          </Text>
          <Text variant="caption" color={colors.onGold}>
            {formatFiat(card.availableUsd)}
          </Text>
        </View>
      </View>

      <View style={styles.statusRow}>
        <Pill
          label={card.frozen ? 'Frozen' : card.status}
          color={usable ? colors.green : colors.warning}
          dot
        />
      </View>
      <Text variant="body" color={colors.ink2} style={styles.statusCopy}>
        {STATUS_COPY[card.frozen ? 'frozen' : card.status]}
      </Text>

      <Card style={styles.card}>
        <Row label="Available to spend" value={formatFiat(card.availableUsd)} valueColor={colors.gold} emphasis />
        <Row label="Funded by" value={card.fundingToken} />
        <Row label="Card ID" value={card.id} valueColor={colors.ink2} />
      </Card>

      <View style={styles.actions}>
        <Button
          label={`Top up ${formatFiat(25)}`}
          variant="premium"
          style={styles.action}
          loading={busy}
          disabled={!usable}
          onPress={() => void topUp()}
        />
        <Button
          label={card.frozen ? 'Unfreeze' : 'Freeze'}
          variant={card.frozen ? 'secondary' : 'danger'}
          style={styles.action}
          loading={busy}
          onPress={() => void toggleFreeze()}
        />
      </View>

      <SectionHeader title="Card activity" />
      {cardTransactions.map((tx) => (
        <Card key={tx.id} tone="muted" style={styles.tx}>
          <View style={styles.txRow}>
            <Text variant="bodyStrong">{tx.merchant}</Text>
            <Text
              variant="bodyStrong"
              color={tx.status === 'refunded' ? colors.green : colors.ink}
            >
              {tx.status === 'refunded' ? '+' : '−'}
              {formatFiat(tx.amountUsd)}
            </Text>
          </View>
          <View style={styles.txRow}>
            <Text variant="caption" color={colors.ink2}>
              {tx.status}
            </Text>
            <Text variant="caption" color={colors.ink2}>
              {relativeTime(tx.timestamp)}
            </Text>
          </View>
        </Card>
      ))}

      <Text variant="caption" color={colors.ink3} style={styles.note}>
        Card details, PIN and statements are served by the issuing partner&apos;s secure component.
        This screen only shows status and sends instructions through the Alli backend.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  plastic: {
    marginTop: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: colors.gold,
    gap: spacing.lg,
    minHeight: 180,
    justifyContent: 'space-between',
  },
  plasticFrozen: { opacity: 0.45 },
  pan: { letterSpacing: 2 },
  plasticFoot: { flexDirection: 'row', justifyContent: 'space-between' },
  statusRow: { marginTop: spacing.lg },
  statusCopy: { marginTop: spacing.sm, marginBottom: spacing.lg },
  card: { gap: spacing.xs, marginBottom: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  action: { flex: 1 },
  tx: { gap: spacing.xs, marginBottom: spacing.sm },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  note: { marginTop: spacing.lg },
});
