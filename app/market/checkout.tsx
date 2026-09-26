import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Field,
  IconTile,
  KeyValueCard,
  Screen,
  ScreenHeader,
  Text,
  toast,
} from '@/components';
import { unitPrice } from '@/features/market/rules';
import { useMarketStore } from '@/features/market/store';
import type { Order, ShippingAddress } from '@/features/market/types';
import { useWalletStore } from '@/features/wallet/store';
import { colors, spacing } from '@/theme';
import { formatToken, shortAddress } from '@/utils/format';

const EMPTY_ADDRESS: ShippingAddress = {
  fullName: '',
  line1: '',
  city: '',
  postcode: '',
  country: '',
  phone: '',
};

const FIELDS: { key: keyof ShippingAddress; label: string; phone?: boolean }[] = [
  { key: 'fullName', label: 'Full name' },
  { key: 'line1', label: 'Address' },
  { key: 'line2', label: 'Apartment, suite (optional)' },
  { key: 'city', label: 'City' },
  { key: 'postcode', label: 'Postcode' },
  { key: 'country', label: 'Country' },
  { key: 'phone', label: 'Phone', phone: true },
];

/** 4.4 Checkout — address, payment source, itemised total; Pay opens the signature sheet. */
export default function CheckoutScreen() {
  const router = useRouter();
  const { entries, totals, currency, setAddress, checkout, pay, placing, address } = useMarketStore();
  const { account, balanceOf, balances, load } = useWalletStore();
  const [form, setForm] = useState<ShippingAddress>(address ?? EMPTY_ADDRESS);
  const [editing, setEditing] = useState(!address);
  // The order is created once and reused, so cancelling the sheet and paying again never
  // leaves a second order behind.
  const [pending, setPending] = useState<Order | null>(null);
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    if (balances.length === 0) void load();
  }, [balances.length, load]);

  const lines = entries();
  const t = totals();
  const balance = Number(balanceOf(currency)?.formatted ?? 0);
  const affordable = balance >= t.total;
  const complete = FIELDS.every((f) => f.key === 'line2' || (form[f.key] ?? '').trim() !== '');

  if (lines.length === 0 && !pending) {
    return (
      <Screen>
        <ScreenHeader title="Checkout" back />
        <EmptyState title="Nothing to pay for" body="Your cart is empty." actionLabel="Browse the market" onAction={() => router.replace('/(tabs)/market')} />
      </Screen>
    );
  }

  const startPay = async () => {
    setAddress(form);
    setEditing(false);
    try {
      // The order exists (awaiting payment) before anything is signed, so a failed or abandoned
      // payment leaves something to retry from.
      setPending(pending ?? (await checkout(currency)));
      setSheet(true);
    } catch (error) {
      toast((error as Error).message, 'error');
    }
  };

  const confirmPay = async () => {
    if (!pending) return;
    try {
      const paid = await pay(pending.id);
      setSheet(false);
      setPending(null);
      router.replace({ pathname: '/market/order/[id]', params: { id: paid.id } });
    } catch (error) {
      const id = pending.id;
      setSheet(false);
      setPending(null);
      toast((error as Error).message, 'error');
      router.replace({ pathname: '/market/order/[id]', params: { id } });
    }
  };

  return (
    <Screen
      footer={
        <>
          {affordable ? (
            <Button
              label={`Pay ${formatToken(t.total)} ${currency}`}
              loading={placing && !pending}
              disabled={!complete}
              onPress={() => void startPay()}
            />
          ) : (
            <Button label={`Top up ${currency}`} onPress={() => router.push('/wallet/receive')} />
          )}
          <Text variant="mono" color={colors.inkFaint} center style={styles.fee}>
            Network fee ≈ 0.0004 BNB
          </Text>
        </>
      }
    >
      <ScreenHeader eyebrow="Review & pay" title="Checkout" back />

      <Card style={styles.block}>
        <View style={styles.rowBetween}>
          <Text variant="label" color={colors.inkFaint}>
            Ship to
          </Text>
          <Pressable accessibilityRole="button" onPress={() => setEditing((e) => !e)} hitSlop={8}>
            <Text variant="caption" color={colors.redHot}>
              {editing ? 'Done' : 'Change'}
            </Text>
          </Pressable>
        </View>
        {editing ? (
          <View style={styles.form}>
            {FIELDS.map((f) => (
              <Field
                key={f.key}
                label={f.label}
                value={form[f.key] ?? ''}
                onChangeText={(v) => setForm({ ...form, [f.key]: v })}
                keyboardType={f.phone ? 'phone-pad' : 'default'}
                accessibilityLabel={f.label}
              />
            ))}
          </View>
        ) : (
          <>
            <Text variant="bodyStrong">{form.fullName}</Text>
            <Text variant="caption" color={colors.inkDim}>
              {[form.line1, form.line2, form.city, form.postcode, form.country].filter(Boolean).join(', ')} ·{' '}
              {form.phone}
            </Text>
          </>
        )}
      </Card>

      <Card style={styles.block}>
        <Text variant="label" color={colors.inkFaint}>
          Pay from
        </Text>
        <View style={styles.rowBetween}>
          <IconTile glyph={currency === 'ALLI' ? 'A' : '$'} size={36} />
          <View style={styles.flex}>
            <Text variant="bodyStrong">{currency} wallet</Text>
            <Text variant="mono" color={colors.inkFaint}>
              {account ? shortAddress(account.address) : '—'}
            </Text>
          </View>
          <View style={styles.right}>
            <Text variant="figure" color={affordable ? colors.ink : colors.warn} style={styles.bal}>
              {formatToken(balance)}
            </Text>
            <Text variant="mono" color={colors.inkFaint}>
              available
            </Text>
          </View>
        </View>
      </Card>

      <View style={styles.block}>
        <KeyValueCard
          lines={[
            ...lines.map((l) => {
              const v = l.product.variants?.find((x) => x.id === l.variantId);
              return {
                label: `${l.quantity} × ${l.product.name}${v ? ` (${v.label})` : ''}`,
                value: `${formatToken(unitPrice(l.product, currency) * l.quantity)} ${currency}`,
              };
            }),
            { label: 'Shipping', value: `${formatToken(t.shipping)} ${currency}` },
          ]}
          total={{ label: 'You pay', value: `${formatToken(t.total)} ${currency}` }}
        />
      </View>

      <Card tone="warn" style={styles.notice}>
        <Text variant="bodyStrong" color={colors.warn}>
          i
        </Text>
        <Text variant="caption" color={colors.inkDim} style={styles.flex}>
          You’ll sign a BEP-20 payment. Orders can be cancelled until they ship.
        </Text>
      </Card>

      <ConfirmSheet
        visible={sheet}
        eyebrow="BEP-20 payment"
        title={`Pay ${formatToken(t.total)} ${currency}`}
        lines={[
          { label: 'Order', value: pending?.number ?? pending?.id ?? '' },
          { label: 'Items', value: String(lines.reduce((s, l) => s + l.quantity, 0)) },
          { label: 'Network', value: 'BNB Smart Chain' },
          { label: 'Network fee', value: '≈ 0.0004 BNB' },
        ]}
        total={{ label: 'You pay', value: `${formatToken(pending?.total ?? t.total)} ${currency}` }}
        confirmLabel="Sign & pay"
        busy={placing}
        onConfirm={() => void confirmPay()}
        onCancel={() => setSheet(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  block: { gap: spacing.sm, marginBottom: 14 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  form: { gap: spacing.md },
  right: { alignItems: 'flex-end' },
  bal: { fontSize: 15 },
  notice: { flexDirection: 'row', gap: spacing.md },
  fee: { fontSize: 11 },
});
