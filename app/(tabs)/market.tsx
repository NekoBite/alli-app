import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  Chips,
  EmptyState,
  Eyebrow,
  Field,
  InviteBanner,
  Screen,
  ScreenHeader,
  Text,
} from '@/components';
import { CATEGORY_LABELS, PRODUCTS, stockOf } from '@/features/market/catalog';
import { useMarketStore } from '@/features/market/store';
import type { Product, ProductCategory } from '@/features/market/types';
import { ProductImage } from '@/features/market/ui/ProductImage';
import { colors, radius, spacing } from '@/theme';
import { formatToken } from '@/utils/format';

type Filter = 'all' | ProductCategory;

/** 4.1 Marketplace — physical goods paid in ALLI or USDT. */
export default function MarketScreen() {
  const router = useRouter();
  const count = useMarketStore((state) => state.itemCount());
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const featured = PRODUCTS.find((p) => p.featured);
  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRODUCTS.filter(
      (p) =>
        (filter === 'all' || p.category === filter) &&
        (!q || p.name.toLowerCase().includes(q) || p.blurb.toLowerCase().includes(q)),
    );
  }, [query, filter]);

  const categories = [...new Set(PRODUCTS.map((p) => p.category))];

  return (
    <Screen inTabs>
      <ScreenHeader
        eyebrow="Spend ALLI"
        title="Market"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Cart, ${count} items`}
            onPress={() => router.push('/market/cart')}
            style={styles.cart}
          >
            <Text variant="bodyStrong" color={colors.redHot}>
              {count}
            </Text>
          </Pressable>
        }
      />

      <View style={styles.stack}>
        <InviteBanner title="Invite shoppers" subtitle="1% of every order they place" href="/referrals/market" />

        <Field
          value={query}
          onChangeText={setQuery}
          placeholder="Search goods"
          returnKeyType="search"
          accessibilityLabel="Search goods"
        />

        <Chips
          options={[
            { value: 'all', label: 'All' },
            ...categories.map((c) => ({ value: c, label: CATEGORY_LABELS[c] })),
          ]}
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
        />

        {featured?.featured && filter === 'all' && !query ? (
          <Card tone="hero" style={styles.featured}>
            <Eyebrow label={featured.featured.eyebrow} color={colors.warn} />
            <Text variant="heading">{featured.featured.title}</Text>
            <Text variant="caption" color={colors.inkDim}>
              {featured.featured.blurb}
            </Text>
            <Button
              label="Shop now"
              variant="secondary"
              size="sm"
              style={styles.shopNow}
              onPress={() => router.push({ pathname: '/market/product/[id]', params: { id: featured.id } })}
            />
          </Card>
        ) : null}

        {products.length === 0 ? (
          <EmptyState glyph="?" title="Nothing matches" body="Try another word or category." />
        ) : (
          <View style={styles.grid}>
            {products.map((product) => (
              <ProductTile
                key={product.id}
                product={product}
                onPress={() => router.push({ pathname: '/market/product/[id]', params: { id: product.id } })}
              />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}

function ProductTile({ product, onPress }: { product: Product; onPress: () => void }) {
  const soldOut = stockOf(product) === 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}${soldOut ? ', sold out' : ''}`}
      disabled={soldOut}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, soldOut && styles.soldOut, pressed && styles.pressed]}
    >
      <ProductImage style={styles.image} label={soldOut ? 'SOLD OUT' : 'IMG'} />
      <Text variant="bodyStrong" style={styles.name} numberOfLines={1}>
        {product.name}
      </Text>
      <Text variant="mono" color={colors.inkFaint} numberOfLines={1}>
        <Text variant="figure" color={colors.redHot} style={styles.price}>
          {formatToken(product.priceAlli)}
        </Text>{' '}
        ALLI · {formatToken(product.priceUsd)} USDT
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 14 },
  cart: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featured: { gap: spacing.sm },
  shopNow: { alignSelf: 'flex-start', marginTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48.4%',
    padding: 8,
    paddingBottom: 12,
    gap: 6,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
  },
  image: { height: 110 },
  name: { fontSize: 14, marginTop: 4, paddingHorizontal: 4 },
  price: { fontSize: 15 },
  soldOut: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
});
