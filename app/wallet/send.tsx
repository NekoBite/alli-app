import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Row, Screen, Text } from '@/components';
import { useWalletStore } from '@/features/wallet/store';
import { chain, type TokenSymbol } from '@/services/chain';
import { colors, radius, spacing, type } from '@/theme';
import { formatToken } from '@/utils/format';

const SYMBOLS: TokenSymbol[] = ['ALLI', 'USDT', 'BNB'];

/** Cheap client-side shape check. The RPC is the real validator. */
function looksLikeAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export default function SendScreen() {
  const router = useRouter();
  const { send, sending, balanceOf } = useWalletStore();
  const [symbol, setSymbol] = useState<TokenSymbol>('ALLI');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');

  const balance = Number(balanceOf(symbol)?.formatted ?? 0);
  const parsed = Number(amount);
  const validAmount = Number.isFinite(parsed) && parsed > 0 && parsed <= balance;
  const validAddress = looksLikeAddress(to);

  const submit = async () => {
    try {
      const { hash } = await send({ to: to.trim(), symbol, amount });
      Alert.alert('Sent', `Transaction submitted.\n\n${hash}`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert('Could not send', (error as Error).message);
    }
  };

  return (
    <Screen>
      <View style={styles.tokens}>
        {SYMBOLS.map((option) => (
          <Pressable
            key={option}
            accessibilityRole="radio"
            accessibilityState={{ selected: symbol === option }}
            onPress={() => setSymbol(option)}
            style={[styles.token, symbol === option && styles.tokenActive]}
          >
            <Text variant="bodyStrong" color={symbol === option ? colors.onGreen : colors.ink}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>

      <Card style={styles.card}>
        <Text variant="label" color={colors.ink2}>
          Recipient address
        </Text>
        <TextInput
          value={to}
          onChangeText={setTo}
          placeholder="0x…"
          placeholderTextColor={colors.ink3}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          accessibilityLabel="Recipient address"
        />
        {to.length > 0 && !validAddress ? (
          <Text variant="caption" color={colors.danger}>
            That is not a valid {chain.name} address.
          </Text>
        ) : null}

        <Text variant="label" color={colors.ink2}>
          Amount
        </Text>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          placeholderTextColor={colors.ink3}
          keyboardType="decimal-pad"
          style={styles.input}
          accessibilityLabel="Amount"
        />
        <Row
          label="Available"
          value={formatToken(balance, symbol)}
          right={
            <Pressable accessibilityRole="button" onPress={() => setAmount(String(balance))} hitSlop={8}>
              <Text variant="bodyStrong" color={colors.green}>
                Max
              </Text>
            </Pressable>
          }
        />
      </Card>

      <Card style={styles.card} tone="muted">
        <Row label="Network" value={chain.name} />
        <Row label="Network fee" value="paid in BNB" valueColor={colors.ink2} />
        <Text variant="caption" color={colors.ink3}>
          Transfers on BNB Smart Chain are irreversible. Check the address before sending — there is
          no way to recover funds sent to the wrong one.
        </Text>
      </Card>

      <Button
        label="Send"
        size="lg"
        loading={sending}
        disabled={!validAddress || !validAmount}
        onPress={() => void submit()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tokens: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.xl },
  token: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  tokenActive: { backgroundColor: colors.green, borderColor: colors.green },
  card: { gap: spacing.sm, marginBottom: spacing.lg },
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
});
