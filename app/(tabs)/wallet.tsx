import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useRouter, type Href } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import {
  Avatar,
  Card,
  EmptyState,
  IconTile,
  InviteBanner,
  ListRow,
  Pill,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  toast,
} from '@/components';
import { useAuthStore } from '@/features/auth/store';
import { useMarketStore } from '@/features/market/store';
import { initialsFor, openProfileMenu } from '@/features/profile/menu';
import { useWalletStore } from '@/features/wallet/store';
import { explorerTxUrl, tokenMeta, type TokenSymbol } from '@/services/chain';
import { colors, fonts, radius, spacing } from '@/theme';
import { formatFiat, formatToken, shortAddress } from '@/utils/format';
import { relativeTime } from '@/utils/time';

const TOKENS: { symbol: TokenSymbol; glyph: string; label: (address?: string) => string }[] = [
  { symbol: 'ALLI', glyph: 'A', label: (a) => `BEP-20${a ? ` · ${shortAddress(a, 6, 4)}` : ''}` },
  { symbol: 'USDT', glyph: '$', label: () => 'BEP-20' },
  { symbol: 'BNB', glyph: 'B', label: () => 'Gas' },
];

type Activity = {
  id: string;
  title: string;
  sub: string;
  amount: string;
  positive: boolean;
  at: number;
  hash?: string;
};

/** 5.1 Wallet — self-custody balances, actions, backup reminder, and merged activity. */
export default function WalletScreen() {
  const router = useRouter();
  const { account, transactions, load, loading, error, balanceOf, usdOf, prices } = useWalletStore();
  const orders = useMarketStore((s) => s.orders);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    void load();
  }, [load]);

  const total = prices
    ? TOKENS.reduce((sum, t) => sum + (usdOf(t.symbol) ?? 0), 0)
    : undefined;

  const activity = useMemo<Activity[]>(() => {
    const chainRows: Activity[] = transactions.map((tx) => ({
      id: tx.hash,
      title: tx.memo ?? (tx.direction === 'in' ? 'Received' : 'Sent'),
      sub: `${shortAddress(tx.counterparty)} · ${tx.status}`,
      amount: `${tx.direction === 'in' ? '+' : '−'}${formatToken(tx.amount)} ${tx.symbol}`,
      positive: tx.direction === 'in',
      at: tx.timestamp,
      hash: tx.hash,
    }));
    const orderRows: Activity[] = orders.map((o) => ({
      id: o.id,
      title: `Order #${o.number ?? o.id}`,
      sub: o.status === 'pending-payment' ? 'awaiting payment' : o.status,
      amount: `−${formatToken(o.total)} ${o.method}`,
      positive: false,
      at: o.createdAt,
      hash: o.txHash,
    }));
    return [...chainRows, ...orderRows].sort((a, b) => b.at - a.at);
  }, [transactions, orders]);

  const markBackedUp = useWalletStore((s) => s.markBackedUp);
  // The recovery flow depends on the custody model (README §1), which is not decided yet. Until
  // then this only records that the member has been shown the reminder and acted on it.
  const backup = () =>
    Alert.alert(
      'Back up your wallet',
      'Write your recovery phrase on paper and keep it offline. Anyone with it controls this wallet.',
      [
        { text: 'Later', style: 'cancel' },
        { text: 'I’ve written it down', onPress: markBackedUp },
      ],
    );

  const copy = async () => {
    if (!account) return;
    await Clipboard.setStringAsync(account.address);
    toast('Address copied', 'ok');
  };

  const actions: { glyph: string; label: string; href?: Href; soon?: string }[] = [
    { glyph: '↑', label: 'Send', href: '/wallet/send' },
    { glyph: '↓', label: 'Receive', href: '/wallet/receive' },
    { glyph: '⇄', label: 'Swap', soon: 'In-app ALLI ⇄ USDT swap is coming soon' },
    { glyph: 'V', label: 'Card', href: '/wallet/card' },
  ];

  return (
    <Screen inTabs onRefresh={load} refreshing={loading}>
      <ScreenHeader
        eyebrow="BNB Smart Chain"
        title="Wallet"
        right={<Avatar initials={initialsFor(user)} onPress={openProfileMenu} />}
      />

      <View style={styles.stack}>
        <InviteBanner
          title="ALLI Card referral"
          subtitle="Reserve your code · coming soon"
          href="/referrals/card"
        />

        <Card tone="hero" style={styles.total}>
          <Text variant="label" color={colors.inkFaint}>
            Total balance
          </Text>
          <Text style={styles.big}>{total !== undefined ? formatFiat(total) : '—'}</Text>
          <View style={styles.rowBetween}>
            <Text variant="mono" color={colors.inkDim}>
              {account ? shortAddress(account.address, 6, 4) : 'No wallet yet'}
            </Text>
            {account ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Copy address" onPress={() => void copy()} hitSlop={8}>
                <Pill label="Copy" color={colors.inkDim} />
              </Pressable>
            ) : null}
          </View>
        </Card>

        <View style={styles.actions}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => (a.href ? router.push(a.href) : toast(a.soon ?? ''))}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <IconTile glyph={a.glyph} size={36} />
              <Text variant="bodyStrong" style={styles.actionLabel}>
                {a.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {account && !account.backedUp ? (
          <Card tone="warn" style={styles.notice} onPress={backup} accessibilityLabel="Back up your wallet">
            <Text variant="bodyStrong" color={colors.warn}>
              !
            </Text>
            <Text variant="caption" color={colors.inkDim} style={styles.flex}>
              Back up your wallet — write down your recovery phrase.
            </Text>
          </Card>
        ) : null}

        <Card style={styles.tight}>
          {TOKENS.map((t) => {
            const b = balanceOf(t.symbol);
            const usd = usdOf(t.symbol);
            return (
              <ListRow
                key={t.symbol}
                glyph={t.glyph}
                title={t.symbol}
                subtitle={t.label(tokenMeta(t.symbol).address)}
                value={b ? formatToken(b.formatted) : '—'}
                valueSub={usd !== undefined ? formatFiat(usd) : undefined}
              />
            );
          })}
        </Card>

        <View>
          <SectionHeader title="Activity" />
          {activity.length === 0 ? (
            <EmptyState glyph="·" title="No activity yet" body="Transfers, star exchanges, orders and credit purchases show up here." />
          ) : (
            <Card style={styles.tight}>
              {activity.slice(0, 20).map((row) => (
                <ListRow
                  key={row.id}
                  title={row.title}
                  subtitle={`${row.sub} · ${relativeTime(row.at)}`}
                  value={row.amount}
                  valueColor={row.positive ? colors.ok : colors.ink}
                  chevron={false}
                  onPress={row.hash ? () => void Linking.openURL(explorerTxUrl(row.hash!)) : undefined}
                />
              ))}
            </Card>
          )}
        </View>

        {error ? (
          <Text variant="caption" color={colors.danger}>
            {error}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  stack: { gap: 14 },
  total: { gap: spacing.sm },
  big: { fontFamily: fonts.display, fontSize: 40, lineHeight: 48, color: colors.ink, letterSpacing: -0.8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', gap: 10 },
  action: {
    flex: 1,
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
  },
  actionLabel: { fontSize: 13 },
  pressed: { opacity: 0.8 },
  notice: { flexDirection: 'row', gap: spacing.md },
  tight: { paddingVertical: 6 },
});
