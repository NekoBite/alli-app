import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Card, Pill, Screen, SectionHeader, Text } from '@/components';
import { CATEGORY_LABELS, PRODUCTS } from '@/features/market/catalog';
import { useMarketStore } from '@/features/market/store';
import type { Product, ProductCategory } from '@/features/market/types';
import { colors, radius, spacing } from '@/theme';
import { formatFiat, formatToken } from '@/utils/format';

type Filter = ProductCategory | 'all';

const FILTERS: Filter[] = ['all', 'gear', 'apparel', 'wellness', 'home'];

export default function MarketScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('all');
  const { itemCount, refreshOrders, orders } = useMarketStore();

  useEffect(() => {
    void refreshOrders();
  }, [refreshOrders]);

  const products = filter === 'all' ? PRODUCTS : PRODUCTS.filter((p) => p.category === filter);
  const count = itemCount();

  return (
    <Screen scroll={false}>
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.column}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <SectionHeader
              title="Marketplace"
              subtitle="Physical goods, paid in ALLI or USDT"
              actionLabel={count > 0 ? `Cart (${count})` : undefined}
              onAction={count > 0 ? () => router.push('/market/cart') : undefined}
            />

            <View style={styles.filters}>
              {FILTERS.map((option) => (
                <Pressable
                  key={option}
                  accessibilityRole="button"
                  onPress={() => setFilter(option)}
                  style={[styles.filter, filter === option && styles.filterActive]}
                >
                  <Text
                    variant="label"
                    color={filter === option ? colors.onGreen : colors.ink2}
                  >
                    {option === 'all' ? 'All' : CATEGORY_LABELS[option]}
                  </Text>
                </Pressable>
              ))}
            </View>

            {orders.length > 0 ? (
              <Text variant="caption" color={colors.ink2} style={styles.orders}>
                {orders.length} order{orders.length > 1 ? 's' : ''} ·{' '}
                {orders[0]?.status.replace('-', ' ')}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <ProductTile
            product={item}
            onPress={() =>
              router.push({ pathname: '/market/product/[id]', params: { id: item.id } })
            }
          />
        )}
      />
    </Screen>
  );
}

function ProductTile({ product, onPress }: { product: Product; onPress: () => void }) {
  return (
    <Card onPress={onPress} style={styles.tile} tone={product.inStock ? 'default' : 'muted'}>
      <View style={[styles.thumb, { backgroundColor: product.accent }]} />
      <Text variant="bodyStrong" numberOfLines={1}>
        {product.name}
      </Text>
      <Text variant="caption" color={colors.green}>
        {formatToken(product.priceAlli, 'ALLI')}
      </Text>
      <Text variant="caption" color={colors.ink2}>
        or {formatFiat(product.priceUsd)} in USDT
      </Text>
      {!product.inStock ? <Pill label="Out of stock" color={colors.ink3} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: spacing.xxl, gap: spacing.md },
  column: { gap: spacing.md },
  header: { paddingTop: spacing.lg, gap: spacing.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  filter: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.line,
  },
  filterActive: { backgroundColor: colors.green, borderColor: colors.green },
  orders: { marginBottom: spacing.sm },
  tile: { flex: 1, gap: spacing.xs, padding: spacing.md },
  thumb: { height: 96, borderRadius: radius.md, opacity: 0.5, marginBottom: spacing.sm },
});
