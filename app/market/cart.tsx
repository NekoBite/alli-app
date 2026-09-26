import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  KeyValueCard,
  Screen,
  ScreenHeader,
  Segmented,
  Stepper,
  Text,
} from '@/components';
import { unitPrice } from '@/features/market/rules';
import { useMarketStore } from '@/features/market/store';
import { ProductImage } from '@/features/market/ui/ProductImage';
import { colors, spacing } from '@/theme';
import { formatStars, formatToken } from '@/utils/format';

/** 4.3 Cart — steppers, currency toggle, totals with shipping and stars back. */
export default function CartScreen() {
  const router = useRouter();
  const { entries, setQuantity, currency, setCurrency, totals, selected, toggleSelected, removeSelected } =
    useMarketStore();
  const lines = entries();
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  if (lines.length === 0) {
    return (
      <Screen>
        <ScreenHeader eyebrow="0 items" title="Cart" back />
        <EmptyState
          glyph="∅"
          title="Your cart is empty"
          body="Add something from the market and it shows up here."
          actionLabel="Browse the market"
          onAction={() => router.replace('/(tabs)/market')}
        />
      </Screen>
    );
  }

  const t = totals();

  return (
    <Screen
      footer={
        <Button
          label={`Checkout · ${formatToken(t.total)} ${currency}`}
          onPress={() => router.push('/market/checkout')}
        />
      }
    >
      <ScreenHeader eyebrow={`${count} item${count === 1 ? '' : 's'}`} title="Cart" back />

      <Card style={styles.lines}>
        {lines.map((line) => {
          const on = selected.includes(line.key);
          const variant = line.product.variants?.find((v) => v.id === line.variantId);
          return (
            <Pressable
              key={line.key}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`Select ${line.product.name}`}
              onLongPress={() => toggleSelected(line.key)}
              onPress={() => (selected.length ? toggleSelected(line.key) : undefined)}
              style={[styles.line, on && styles.lineOn]}
            >
              <ProductImage style={styles.thumb} />
              <View style={styles.flex}>
                <View style={styles.lineHead}>
                  <Text variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                    {line.product.name}
                  </Text>
                  <Text variant="monoStrong">
                    {formatToken(unitPrice(line.product, currency) * line.quantity)} {currency}
                  </Text>
                </View>
                {variant ? (
                  <Text variant="caption" color={colors.inkDim}>
                    Size {variant.label}
                  </Text>
                ) : null}
                <View style={styles.stepper}>
                  <Stepper value={line.quantity} onChange={(q) => setQuantity(line.key, q)} min={0} max={10} />
                </View>
              </View>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          disabled={!selected.length}
          onPress={removeSelected}
          hitSlop={8}
        >
          <Text variant="caption" color={selected.length ? colors.redHot : colors.inkFaint}>
            {selected.length ? `Remove selected (${selected.length})` : 'Long-press a line to select it'}
          </Text>
        </Pressable>
      </Card>

      <Segmented
        options={[
          { value: 'ALLI', label: 'Pay in ALLI' },
          { value: 'USDT', label: 'Pay in USDT' },
        ]}
        value={currency}
        onChange={setCurrency}
        style={styles.toggle}
      />

      <KeyValueCard
        lines={[
          { label: 'Subtotal', value: `${formatToken(t.subtotal)} ${currency}` },
          { label: 'Shipping', value: `${formatToken(t.shipping)} ${currency}` },
          ...(currency === 'ALLI'
            ? [{ label: 'Stars back (10%)', value: `+${formatStars(t.starsBack)} ★`, color: colors.ok }]
            : []),
        ]}
        total={{ label: 'Total', value: `${formatToken(t.total)} ${currency}` }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  lines: { gap: spacing.md },
  line: { flexDirection: 'row', gap: spacing.md, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  lineOn: { backgroundColor: colors.redFill, borderRadius: 10 },
  lineHead: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  thumb: { width: 52, height: 52 },
  stepper: { marginTop: spacing.sm },
  toggle: { marginVertical: 14 },
});
