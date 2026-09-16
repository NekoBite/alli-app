import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Pill, Row, Screen, Text } from '@/components';
import { CATEGORY_LABELS, findProduct } from '@/features/market/catalog';
import { useMarketStore } from '@/features/market/store';
import { colors, radius, spacing } from '@/theme';
import { formatFiat, formatToken } from '@/utils/format';

export default function ProductScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const add = useMarketStore((state) => state.add);
  const product = id ? findProduct(id) : undefined;

  if (!product) {
    return (
      <Screen>
        <EmptyState
          title="Product not found"
          body="This listing is no longer available."
          actionLabel="Back to marketplace"
          onAction={() => router.replace('/(tabs)/market')}
        />
      </Screen>
    );
  }

  const discount = 1 - product.priceAlli / (product.priceUsd * 80);

  return (
    <Screen>
      <View style={[styles.hero, { backgroundColor: product.accent }]} />

      <View style={styles.title}>
        <Text variant="title">{product.name}</Text>
        <Pill label={CATEGORY_LABELS[product.category]} color={colors.ink2} />
      </View>

      <Text variant="body" color={colors.ink2} style={styles.blurb}>
        {product.blurb}
      </Text>

      <Card style={styles.card}>
        <Row
          label="Pay in ALLI"
          value={formatToken(product.priceAlli, 'ALLI')}
          valueColor={colors.green}
          emphasis
        />
        <Row label="Pay in USDT" value={formatFiat(product.priceUsd)} valueColor={colors.teal} />
        {discount > 0.01 ? (
          <Text variant="caption" color={colors.green}>
            Paying in ALLI is about {(discount * 100).toFixed(0)}% cheaper at the reference rate.
          </Text>
        ) : null}
      </Card>

      <Card style={styles.card} tone="muted">
        <Row
          label="Availability"
          value={product.inStock ? 'In stock' : 'Out of stock'}
          valueColor={product.inStock ? colors.green : colors.ink3}
        />
        <Row
          label="Ships to"
          value={product.shipsTo.length === 0 ? 'Worldwide' : product.shipsTo.join(', ')}
        />
        <Row label="Fulfilment" value="3–7 business days" />
      </Card>

      <Text variant="caption" color={colors.ink3} style={styles.note}>
        Orders are held in `pending-payment` until the on-chain transfer is confirmed by the
        backend. Shipping and taxes are calculated at checkout.
      </Text>

      <Button
        label={product.inStock ? 'Add to cart' : 'Out of stock'}
        size="lg"
        disabled={!product.inStock}
        onPress={() => {
          add(product.id);
          router.push('/market/cart');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 200, borderRadius: radius.xl, opacity: 0.45, marginTop: spacing.lg },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  blurb: { marginTop: spacing.sm, marginBottom: spacing.lg },
  card: { gap: spacing.xs, marginBottom: spacing.lg },
  note: { marginBottom: spacing.lg },
});
