import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  BackButton,
  Button,
  Chips,
  EmptyState,
  Pill,
  Row,
  Screen,
  SectionHeader,
  Stepper,
  Text,
  toast,
} from '@/components';
import { findProduct, stockOf } from '@/features/market/catalog';
import { useMarketStore } from '@/features/market/store';
import { ProductImage } from '@/features/market/ui/ProductImage';
import { useReferralStore } from '@/features/referrals/store';
import { colors, spacing } from '@/theme';
import { formatToken } from '@/utils/format';

const GALLERY = 3;

/** 4.2 Product detail — gallery, variant, quantity; Add to cart or Buy now. */
export default function ProductScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const add = useMarketStore((state) => state.add);
  const marketCode = useReferralStore((s) => s.hub?.programs.find((p) => p.program === 'market')?.code);
  const product = id ? findProduct(id) : undefined;
  const [variantId, setVariantId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [page, setPage] = useState(0);

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

  const needsVariant = !!product.variants?.length;
  const stock = stockOf(product, variantId ?? undefined);
  const ready = (!needsVariant || !!variantId) && stock > 0;
  const galleryWidth = width - spacing.gutter * 2;

  const share = () => {
    // A product link carries the sharer's Market code, so a sale through it attributes to them (6.4).
    const link = `https://alli.app/m/${product.id}${marketCode ? `?r=${marketCode}` : ''}`;
    void Share.share({ message: `${product.name} on ALLI Market — ${link}` }).catch(() => undefined);
  };

  const addToCart = () => {
    add(product.id, variantId ?? undefined, quantity);
    toast(`${product.name} added to cart`, 'ok');
  };

  const buyNow = () => {
    add(product.id, variantId ?? undefined, quantity);
    router.push('/market/checkout');
  };

  return (
    <Screen
      footer={
        <View style={styles.pair}>
          <Button label="Add to cart" variant="secondary" disabled={!ready} onPress={addToCart} style={styles.flex} />
          <Button label="Buy now" disabled={!ready} onPress={buyNow} style={styles.flex} />
        </View>
      }
    >
      <View style={styles.top}>
        <BackButton onPress={() => router.back()} />
        <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={share} style={styles.share}>
          <Text variant="bodyStrong">↗</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / galleryWidth))}
        style={styles.gallery}
      >
        {Array.from({ length: GALLERY }, (_, i) => (
          <ProductImage key={i} label="PRODUCT IMAGE" style={{ width: galleryWidth, height: 220 }} />
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {Array.from({ length: GALLERY }, (_, i) => (
          <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
        ))}
      </View>

      <View style={styles.titleRow}>
        <Text variant="heading" style={styles.flex}>
          {product.name}
        </Text>
        <Pill
          label={stock > 0 ? `In stock · ${stock}` : 'Sold out'}
          color={stock > 0 ? colors.ok : colors.warn}
        />
      </View>
      <View style={styles.price}>
        <Text variant="heading" color={colors.redHot}>
          {formatToken(product.priceAlli)} ALLI
        </Text>
        <Text variant="mono" color={colors.inkFaint}>
          or {formatToken(product.priceUsd)} USDT
        </Text>
      </View>
      <Text variant="body" color={colors.inkDim} style={styles.blurb}>
        {product.blurb}
      </Text>

      {needsVariant ? (
        <View style={styles.section}>
          <SectionHeader title="Size" note={variantId ? undefined : 'pick one'} />
          <Chips
            round
            options={product.variants!.map((v) => ({ value: v.id, label: v.label, disabled: v.stock === 0 }))}
            value={variantId}
            onChange={setVariantId}
          />
        </View>
      ) : null}

      <View style={[styles.section, styles.qty]}>
        <Text variant="label" color={colors.inkFaint}>
          Quantity
        </Text>
        <Stepper value={quantity} onChange={setQuantity} min={1} max={Math.max(1, Math.min(stock, 10))} />
      </View>

      <Row
        label="Shipping"
        value={`3–5 days · ${product.shipsTo.length ? product.shipsTo.join(', ') : 'Worldwide'}`}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm, marginBottom: spacing.lg },
  share: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.ghostFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gallery: { flexGrow: 0 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: spacing.md },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.inkFaint },
  dotOn: { width: 16, backgroundColor: colors.redHot },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  price: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.xs },
  blurb: { marginTop: spacing.md, fontSize: 14 },
  section: { marginTop: spacing.lg },
  qty: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  pair: { flexDirection: 'row', gap: 10 },
});
