import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Row, Screen, SectionHeader, Text } from '@/components';
import { useMarketStore } from '@/features/market/store';
import type { PaymentMethod, ShippingAddress } from '@/features/market/types';
import { useWalletStore } from '@/features/wallet/store';
import { colors, radius, spacing, type } from '@/theme';
import { formatFiat, formatToken } from '@/utils/format';

const EMPTY_ADDRESS: ShippingAddress = {
  fullName: '',
  line1: '',
  city: '',
  postcode: '',
  country: '',
  phone: '',
};

export default function CheckoutScreen() {
  const router = useRouter();
  const { entries, total, setAddress, checkout, placing, address } = useMarketStore();
  const balanceOf = useWalletStore((state) => state.balanceOf);

  const [method, setMethod] = useState<PaymentMethod>('ALLI');
  const [form, setForm] = useState<ShippingAddress>(address ?? EMPTY_ADDRESS);

  const lines = entries();
  const amount = total(method);
  const balance = Number(balanceOf(method)?.formatted ?? 0);
  const affordable = balance >= amount;

  const complete =
    form.fullName.trim() !== '' &&
    form.line1.trim() !== '' &&
    form.city.trim() !== '' &&
    form.postcode.trim() !== '' &&
    form.country.trim() !== '' &&
    form.phone.trim() !== '';

  const placeOrder = async () => {
    setAddress(form);
    try {
      const order = await checkout(method);
      Alert.alert(
        'Order placed',
        `Order ${order.id} is waiting for payment of ${
          method === 'ALLI' ? formatToken(order.total, 'ALLI') : formatFiat(order.total)
        }. It ships once the transfer confirms on-chain.`,
        [{ text: 'OK', onPress: () => router.replace('/(tabs)/market') }],
      );
    } catch (error) {
      Alert.alert('Checkout failed', (error as Error).message);
    }
  };

  return (
    <Screen>
      <SectionHeader title="Pay with" />
      <View style={styles.methods}>
        {(['ALLI', 'USDT'] as PaymentMethod[]).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: method === option }}
            onPress={() => setMethod(option)}
            style={[styles.method, method === option && styles.methodActive]}
          >
            <Text variant="bodyStrong" color={method === option ? colors.onGreen : colors.ink}>
              {option}
            </Text>
            <Text variant="caption" color={method === option ? colors.onGreen : colors.ink2}>
              {option === 'ALLI' ? 'Earned from running' : 'BNB Chain stablecoin'}
            </Text>
          </Pressable>
        ))}
      </View>

      <SectionHeader title="Ship to" />
      <Card style={styles.card}>
        <Field label="Full name" value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} />
        <Field label="Address" value={form.line1} onChange={(v) => setForm({ ...form, line1: v })} />
        <Field
          label="Apartment, suite (optional)"
          value={form.line2 ?? ''}
          onChange={(v) => setForm({ ...form, line2: v })}
        />
        <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
        <Field
          label="Postcode"
          value={form.postcode}
          onChange={(v) => setForm({ ...form, postcode: v })}
        />
        <Field
          label="Country"
          value={form.country}
          onChange={(v) => setForm({ ...form, country: v })}
        />
        <Field
          label="Phone"
          value={form.phone}
          onChange={(v) => setForm({ ...form, phone: v })}
          keyboardType="phone-pad"
        />
      </Card>

      <SectionHeader title="Summary" />
      <Card style={styles.card} tone="muted">
        {lines.map(({ product, quantity }) => (
          <Row
            key={product.id}
            label={`${product.name} × ${quantity}`}
            value={
              method === 'ALLI'
                ? formatToken(product.priceAlli * quantity, 'ALLI')
                : formatFiat(product.priceUsd * quantity)
            }
          />
        ))}
        <Row
          label="Total"
          value={method === 'ALLI' ? formatToken(amount, 'ALLI') : formatFiat(amount)}
          valueColor={colors.green}
          emphasis
        />
        <Row
          label="Your balance"
          value={formatToken(balance, method)}
          valueColor={affordable ? colors.ink2 : colors.danger}
        />
      </Card>

      {!affordable ? (
        <Text variant="caption" color={colors.danger} style={styles.warn}>
          Not enough {method}. Redeem points or top up before placing this order.
        </Text>
      ) : null}

      <Button
        label="Place order"
        size="lg"
        loading={placing}
        disabled={!complete || !affordable || lines.length === 0}
        onPress={() => void placeOrder()}
      />
      <Text variant="caption" color={colors.ink3} style={styles.note}>
        Placing an order does not move funds. The backend returns a payment address and watches the
        chain for the transfer before anything ships.
      </Text>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChange,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboardType?: 'default' | 'phone-pad';
}) {
  return (
    <View style={styles.field}>
      <Text variant="label" color={colors.ink2}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType ?? 'default'}
        placeholderTextColor={colors.ink3}
        style={styles.input}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  methods: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  method: {
    flex: 1,
    gap: 2,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  methodActive: { backgroundColor: colors.green, borderColor: colors.green },
  card: { gap: spacing.md, marginBottom: spacing.xl },
  field: { gap: spacing.xs },
  input: {
    ...type.body,
    color: colors.ink,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineNeutral,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  warn: { marginBottom: spacing.md },
  note: { marginTop: spacing.md },
});
