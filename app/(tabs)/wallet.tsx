import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Pill, Row, Screen, SectionHeader, Text } from '@/components';
import { useWalletStore } from '@/features/wallet/store';
import { chain, type TokenBalance } from '@/services/chain';
import { colors, spacing } from '@/theme';
import { formatFiat, formatToken, shortAddress } from '@/utils/format';
import { relativeTime } from '@/utils/time';

export default function WalletScreen() {
  const router = useRouter();
  const { account, balances, transactions, card, load, loading, error } = useWalletStore();

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen onRefresh={load} refreshing={loading}>
      <View style={styles.head}>
        <Text variant="label" color={colors.ink2}>
          {chain.name}
        </Text>
        <Text variant="body" color={colors.ink2}>
          {account ? shortAddress(account.address) : 'No wallet yet'}
        </Text>
        {account && !account.backedUp ? (
          <Pill label="Back up your wallet" color={colors.warning} dot />
        ) : null}
      </View>

      {balances.map((balance) => (
        <BalanceRow key={balance.symbol} balance={balance} />
      ))}

      <View style={styles.actions}>
        <Button label="Send" style={styles.action} onPress={() => router.push('/wallet/send')} />
        <Button
          label="Receive"
          variant="secondary"
          style={styles.action}
          onPress={() => router.push('/wallet/receive')}
        />
      </View>

      <SectionHeader title="Visa card" actionLabel="Manage" onAction={() => router.push('/wallet/card')} />
      <Card tone="premium" style={styles.card}>
        {card ? (
          <>
            <Row
              label={`•••• •••• •••• ${card.last4 ?? '----'}`}
              value={card.frozen ? 'Frozen' : card.status}
              valueColor={card.frozen ? colors.ink3 : colors.gold}
              emphasis
            />
            <Row label="Available" value={formatFiat(card.availableUsd)} valueColor={colors.gold} />
            <Row label="Funded by" value={card.fundingToken} />
          </>
        ) : (
          <Text variant="body" color={colors.ink2}>
            No card on this account yet. Applying starts KYC with the issuing partner.
          </Text>
        )}
      </Card>

      <SectionHeader title="Activity" />
      {transactions.length === 0 ? (
        <EmptyState title="No transactions" body="Transfers in and out of this wallet show up here." />
      ) : (
        transactions.map((tx) => (
          <Card key={tx.hash} style={styles.tx} tone="muted">
            <View style={styles.txHead}>
              <Text variant="bodyStrong">{tx.memo ?? (tx.direction === 'in' ? 'Received' : 'Sent')}</Text>
              <Text
                variant="bodyStrong"
                color={tx.direction === 'in' ? colors.green : colors.ink}
              >
                {tx.direction === 'in' ? '+' : '−'}
                {formatToken(tx.amount, tx.symbol)}
              </Text>
            </View>
            <View style={styles.txHead}>
              <Text variant="caption" color={colors.ink2}>
                {shortAddress(tx.counterparty)}
              </Text>
              <Text variant="caption" color={colors.ink2}>
                {relativeTime(tx.timestamp)}
              </Text>
            </View>
          </Card>
        ))
      )}

      {error ? (
        <Text variant="caption" color={colors.danger} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </Screen>
  );
}

function BalanceRow({ balance }: { balance: TokenBalance }) {
  const accent =
    balance.symbol === 'ALLI' ? colors.green : balance.symbol === 'USDT' ? colors.teal : colors.ink2;

  return (
    <Card style={styles.balance}>
      <View style={styles.balanceRow}>
        <Text variant="bodyStrong" color={accent}>
          {balance.symbol}
        </Text>
        <Text variant="title">{formatToken(balance.formatted)}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { paddingTop: spacing.lg, paddingBottom: spacing.lg, gap: spacing.xs },
  balance: { marginBottom: spacing.md, paddingVertical: spacing.md },
  balanceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', gap: spacing.md, marginVertical: spacing.lg },
  action: { flex: 1 },
  card: { gap: spacing.xs, marginBottom: spacing.xl },
  tx: { gap: spacing.xs, marginBottom: spacing.sm },
  txHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  error: { marginTop: spacing.lg },
});
