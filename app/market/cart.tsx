import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Row, Screen, Text } from '@/components';
import { useMarketStore } from '@/features/market/store';
import { colors, radius, spacing } from '@/theme';
import { formatFiat, formatToken } from '@/utils/format';

export default function CartScreen() {
  const router = useRouter();
  const { entries, setQuantity, remove, total, clear } = useMarketStore();
  const lines = entries();

  if (lines.length === 0) {
    return (
      <Screen>
        <EmptyState
          title="Your cart is empty"
          body="Add something from the marketplace and it will show up here."
          actionLabel="Browse the marketplace"
          onAction={() => router.replace('/(tabs)/market')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      {lines.map(({ product, quantity }) => (
        <Card key={product.id} style={styles.line}>
          <View style={styles.lineHead}>
            <View style={styles.lineTitle}>
              <Text variant="bodyStrong">{product.name}</Text>
              <Text variant="caption" color={colors.green}>
                {formatToken(product.priceAlli, 'ALLI')} · {formatFiat(product.priceUsd)}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove ${product.name}`}
              onPress={() => remove(product.id)}
              hitSlop={8}
            >
              <Text variant="caption" color={colors.danger}>
                Remove
              </Text>
            </Pressable>
          </View>

          <View style={styles.qty}>
            <Stepper label="−" onPress={() => setQuantity(product.id, quantity - 1)} />
            <Text variant="bodyStrong">{quantity}</Text>
            <Stepper label="+" onPress={() => setQuantity(product.id, quantity + 1)} />
          </View>
        </Card>
      ))}

      <Card style={styles.summary} tone="muted">
        <Row
          label="Total in ALLI"
          value={formatToken(total('ALLI'), 'ALLI')}
          valueColor={colors.green}
          emphasis
        />
        <Row label="Total in USDT" value={formatFiat(total('USDT'))} valueColor={colors.teal} />
        <Text variant="caption" color={colors.ink3}>
          Shipping and any duties are added at checkout once an address is set.
        </Text>
      </Card>

      <Button label="Checkout" size="lg" onPress={() => router.push('/market/checkout')} />
      <Button label="Clear cart" variant="ghost" onPress={clear} />
    </Screen>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.stepper}>
      <Text variant="bodyStrong" color={colors.green}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: { gap: spacing.md, marginBottom: spacing.md, marginTop: spacing.lg },
  lineHead: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  lineTitle: { flex: 1, gap: 2 },
  qty: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  stepper: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.line,
  },
  summary: { gap: spacing.xs, marginBottom: spacing.lg },
});
