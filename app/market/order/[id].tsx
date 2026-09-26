import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  Gradient,
  Pill,
  Row,
  Screen,
  ScreenHeader,
  Steps,
  Text,
  toast,
} from '@/components';
import { useMarketStore } from '@/features/market/store';
import type { OrderStatus } from '@/features/market/types';
import { explorerTxUrl } from '@/services/chain';
import { colors, fonts, spacing } from '@/theme';
import { formatStars, formatToken, shortAddress } from '@/utils/format';

const STEP_INDEX: Record<OrderStatus, number> = {
  'pending-payment': 0,
  paid: 1,
  shipped: 2,
  delivered: 4,
  cancelled: 0,
};

/** 4.5 Order placed — number, tx hash (opens BscScan), stars back, and tracking. */
export default function OrderScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const order = useMarketStore((s) => s.orders.find((o) => o.id === id));
  const pay = useMarketStore((s) => s.pay);
  const placing = useMarketStore((s) => s.placing);

  if (!order) {
    return (
      <Screen>
        <ScreenHeader title="Order" back={() => router.replace('/(tabs)/market')} />
        <EmptyState title="Order not found" body="It may take a moment to appear." actionLabel="Back to market" onAction={() => router.replace('/(tabs)/market')} />
      </Screen>
    );
  }

  const awaiting = order.status === 'pending-payment';
  const retry = async () => {
    try {
      await pay(order.id);
      toast('Payment confirmed', 'ok');
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const time = new Date(order.createdAt);
  const hhmm = `${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')}`;

  return (
    <Screen
      footer={
        <View style={styles.pair}>
          <Button
            label={awaiting ? 'Retry payment' : 'Track order'}
            variant="secondary"
            loading={awaiting && placing}
            onPress={awaiting ? () => void retry() : () => router.push('/(tabs)/wallet')}
            style={styles.flex}
          />
          <Button label="Back to market" onPress={() => router.replace('/(tabs)/market')} style={styles.flex} />
        </View>
      }
    >
      <View style={styles.hero}>
        <Gradient style={[styles.check, awaiting && styles.checkWarn]}>
          <Text style={styles.checkMark} color={colors.onRed}>
            {awaiting ? '!' : '✓'}
          </Text>
        </Gradient>
        <Text variant="title" center>
          {awaiting ? 'Awaiting payment' : 'Order placed'}
        </Text>
        <Text variant="caption" color={colors.inkDim} center>
          #{order.number ?? order.id} · {awaiting ? 'the payment did not go through yet.' : 'we’ll send tracking updates.'}
        </Text>
      </View>

      <Card style={styles.block}>
        <Row label={awaiting ? 'To pay' : 'Paid'} value={`${formatToken(order.total)} ${order.method}`} />
        {order.starsBack ? (
          <Row label="Stars back" value={`+${formatStars(order.starsBack)} ★`} valueColor={colors.ok} />
        ) : null}
        <Row
          label="Tx hash"
          right={
            order.txHash ? (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(explorerTxUrl(order.txHash!))}>
                <Text variant="monoStrong" color={colors.ink}>
                  {shortAddress(order.txHash, 6, 4)} ↗
                </Text>
              </Pressable>
            ) : (
              <Text variant="monoStrong" color={colors.inkFaint}>
                —
              </Text>
            )
          }
        />
        <Row
          label="Status"
          right={<Pill label={awaiting ? 'Awaiting payment' : 'Confirmed'} color={awaiting ? colors.warn : colors.ok} />}
        />
      </Card>

      <Card style={styles.block}>
        <Text variant="label" color={colors.inkFaint}>
          Tracking
        </Text>
        <Steps
          current={STEP_INDEX[order.status]}
          steps={[
            { title: 'Paid', note: awaiting ? undefined : hhmm },
            { title: 'Packing', note: order.status === 'paid' ? 'today' : undefined },
            { title: 'Shipped', detail: order.trackingNumber },
            { title: 'Delivered' },
          ]}
        />
      </Card>
      <Text variant="caption" color={colors.inkFaint}>
        Tracking updates arrive as notifications. Your orders are listed under Wallet → Activity.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xxl, marginBottom: spacing.xl },
  check: { width: 64, height: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  checkWarn: { opacity: 0.7 },
  checkMark: { fontSize: 32, lineHeight: 38, fontFamily: fonts.display },
  block: { gap: 4, marginBottom: 14 },
  pair: { flexDirection: 'row', gap: 10 },
});
