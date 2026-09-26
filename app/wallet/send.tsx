import { getAddress } from 'ethers';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import {
  Button,
  Card,
  ConfirmSheet,
  Field,
  IconTile,
  KeyValueCard,
  Pill,
  Screen,
  ScreenHeader,
  Text,
  toast,
} from '@/components';
import { useWalletStore } from '@/features/wallet/store';
import { chain, chainClient, type FeeEstimate, type TokenSymbol } from '@/services/chain';
import { colors, fonts, spacing } from '@/theme';
import { formatFiat, formatToken } from '@/utils/format';

const SYMBOLS: TokenSymbol[] = ['ALLI', 'USDT', 'BNB'];

/** EIP-55 check: all-lower / all-upper is accepted, mixed case must match its checksum. */
function checkAddress(value: string): 'ok' | 'bad-checksum' | 'invalid' {
  const v = value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(v)) return 'invalid';
  try {
    getAddress(v);
    return 'ok';
  } catch {
    return 'bad-checksum';
  }
}

/** 5.2 Send — token, address, amount; review sheet; pending tx lands in Activity. */
export default function SendScreen() {
  const router = useRouter();
  const { send, sending, balanceOf, prices, transactions, balances, load } = useWalletStore();
  const [symbol, setSymbol] = useState<TokenSymbol>('ALLI');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState<FeeEstimate | null>(null);
  const [review, setReview] = useState(false);

  useEffect(() => {
    if (balances.length === 0) void load();
  }, [balances.length, load]);

  useEffect(() => {
    void chainClient()
      .estimateTransferFee(symbol)
      .then(setFee)
      .catch(() => setFee(null));
  }, [symbol]);

  const balance = Number(balanceOf(symbol)?.formatted ?? 0);
  const bnb = Number(balanceOf('BNB')?.formatted ?? 0);
  const gas = Number(fee?.bnb ?? 0.0004);
  const parsed = Number(amount);
  const addr = checkAddress(to);
  const known = transactions.some((t) => t.counterparty.toLowerCase() === to.trim().toLowerCase());
  const noGas = balances.length > 0 && bnb < gas + (symbol === 'BNB' ? parsed || 0 : 0);
  const amountError =
    amount && (!Number.isFinite(parsed) || parsed <= 0)
      ? 'Enter an amount.'
      : parsed > balance
        ? `You hold ${formatToken(balance)} ${symbol}.`
        : null;
  const ready = addr === 'ok' && !!amount && !amountError && !noGas;
  const usd = prices && Number.isFinite(parsed) ? parsed * prices[symbol] : undefined;

  const max = () => {
    // Max leaves gas behind when sending the gas token itself.
    const v = symbol === 'BNB' ? Math.max(0, balance - gas * 1.5) : balance;
    setAmount(String(Math.floor(v * 1e6) / 1e6));
  };

  const cycle = () => setSymbol(SYMBOLS[(SYMBOLS.indexOf(symbol) + 1) % SYMBOLS.length]!);

  const submit = async () => {
    try {
      await send({ to: getAddress(to.trim()), symbol, amount });
      setReview(false);
      toast('Transfer sent — pending in Activity', 'ok');
      router.replace('/(tabs)/wallet');
    } catch (error) {
      setReview(false);
      toast((error as Error).message, 'error');
    }
  };

  return (
    <Screen footer={<Button label="Review send" disabled={!ready} onPress={() => setReview(true)} />}>
      <ScreenHeader eyebrow="BEP-20 transfer" title="Send" back />

      <Card style={styles.tokenRow}>
        <IconTile glyph={symbol === 'USDT' ? '$' : symbol[0]!} size={36} />
        <View style={styles.flex}>
          <Text variant="bodyStrong">{symbol}</Text>
          <Text variant="mono" color={colors.inkFaint}>
            Balance {formatToken(balance)}
          </Text>
        </View>
        <Pressable accessibilityRole="button" onPress={cycle} hitSlop={8}>
          <Text variant="bodyStrong" color={colors.redHot}>
            Change
          </Text>
        </Pressable>
      </Card>

      <View style={styles.block}>
        <Field
          label="To"
          value={to}
          onChangeText={setTo}
          placeholder="0x… address"
          autoCapitalize="none"
          autoCorrect={false}
          mono
          accessibilityLabel="Recipient address"
          error={
            to && addr === 'invalid'
              ? 'That is not a BNB Smart Chain address.'
              : addr === 'bad-checksum'
                ? 'The checksum does not match — check for a typo.'
                : null
          }
          right={
            <Pressable accessibilityRole="button" onPress={() => toast('QR scanning arrives with the camera permission')}>
              <Pill label="Scan" />
            </Pressable>
          }
        />
        {addr === 'ok' && !known ? (
          <Text variant="caption" color={colors.warn}>
            First time sending to this address. Double-check it.
          </Text>
        ) : null}
      </View>

      <Card tone="hero" style={styles.amountCard}>
        <View style={styles.rowBetween}>
          <Text variant="label" color={colors.inkFaint}>
            Amount
          </Text>
          <Pressable accessibilityRole="button" onPress={max} hitSlop={8}>
            <Text variant="bodyStrong" color={colors.redHot}>
              Max
            </Text>
          </Pressable>
        </View>
        <TextInput
          value={amount}
          onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ''))}
          placeholder="0"
          placeholderTextColor={colors.inkFaint}
          keyboardType="decimal-pad"
          style={styles.amount}
          accessibilityLabel={`Amount in ${symbol}`}
        />
        <Text variant="mono" color={amountError ? colors.warn : colors.inkFaint}>
          {amountError ?? (usd !== undefined ? `≈ ${formatFiat(usd)}` : ' ')}
        </Text>
      </Card>

      <View style={styles.block}>
        <KeyValueCard
          lines={[
            { label: 'Network', value: chain.name },
            { label: 'Network fee', value: `≈ ${Number(fee?.bnb ?? 0.0004).toFixed(4)} BNB` },
            { label: 'Arrives', value: '~ 3 seconds' },
          ]}
        />
      </View>

      {noGas ? (
        <Card tone="warn" onPress={() => router.push('/wallet/receive')} style={styles.notice}>
          <Text variant="caption" color={colors.inkDim}>
            Not enough BNB to pay the network fee. Tap to receive BNB.
          </Text>
        </Card>
      ) : (
        <Card tone="warn" style={styles.notice}>
          <Text variant="caption" color={colors.inkDim}>
            <Text variant="bodyStrong" color={colors.warn}>
              !{' '}
            </Text>
            On-chain transfers are final. Double-check the address — sending to another network
            loses funds.
          </Text>
        </Card>
      )}

      <ConfirmSheet
        visible={review}
        eyebrow="BEP-20 transfer"
        title={`Send ${amount} ${symbol}`}
        lines={[
          { label: 'To', value: to.trim() ? `${to.trim().slice(0, 8)}…${to.trim().slice(-6)}` : '' },
          { label: 'Network', value: chain.name },
          { label: 'Network fee', value: `≈ ${Number(fee?.bnb ?? 0.0004).toFixed(4)} BNB` },
        ]}
        total={{ label: 'Amount', value: `${amount} ${symbol}` }}
        note="Once signed this cannot be undone."
        confirmLabel="Confirm & send"
        busy={sending}
        onConfirm={() => void submit()}
        onCancel={() => setReview(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: 14 },
  block: { gap: spacing.sm, marginBottom: 14 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountCard: { gap: spacing.sm, marginBottom: 14 },
  amount: { fontFamily: fonts.display, fontSize: 44, lineHeight: 52, color: colors.ink, padding: 0 },
  notice: { paddingVertical: 14 },
});
