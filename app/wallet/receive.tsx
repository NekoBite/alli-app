import { Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';

import { Button, Card, EmptyState, Row, Screen, Text } from '@/components';
import { useWalletStore } from '@/features/wallet/store';
import { chain } from '@/services/chain';
import { colors, radius, spacing } from '@/theme';

export default function ReceiveScreen() {
  const account = useWalletStore((state) => state.account);

  if (!account) {
    return (
      <Screen>
        <EmptyState title="No wallet yet" body="Sign in to create a wallet before receiving funds." />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.qrWrap}>
        {/* TODO: render a real QR with react-native-qrcode-svg once it is added. */}
        <View style={styles.qr}>
          <Text variant="caption" color={colors.ink3} center>
            QR code
          </Text>
        </View>
      </View>

      <Card style={styles.card}>
        <Text variant="label" color={colors.ink2}>
          Your {chain.name} address
        </Text>
        <Text variant="body" style={styles.address}>
          {account.address}
        </Text>
      </Card>

      <Card style={styles.card} tone="muted">
        <Row label="Network" value={chain.name} />
        <Row label="Chain ID" value={String(chain.chainId)} />
        <Text variant="caption" color={colors.ink3}>
          Only send BNB Chain (BEP-20) assets to this address. Tokens sent on another network are
          lost permanently.
        </Text>
      </Card>

      <Button
        label="Copy address"
        size="lg"
        onPress={() => void Clipboard.setStringAsync(account.address)}
      />
      <Button
        label="Share"
        variant="secondary"
        onPress={() => void Share.share({ message: account.address })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  qrWrap: { alignItems: 'center', paddingVertical: spacing.xl },
  qr: {
    width: 200,
    height: 200,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { gap: spacing.sm, marginBottom: spacing.lg },
  address: { fontFamily: 'monospace' },
});
