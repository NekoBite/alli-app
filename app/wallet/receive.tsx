import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import {
  Button,
  Card,
  EmptyState,
  Logo,
  Screen,
  ScreenHeader,
  Segmented,
  Text,
  toast,
} from '@/components';
import { useWalletStore } from '@/features/wallet/store';
import { chain, tokenMeta, type TokenSymbol } from '@/services/chain';
import { colors, fonts, radius, spacing } from '@/theme';

/** 5.3 Receive — one address for every BEP-20 token; the token picker only changes the hint. */
export default function ReceiveScreen() {
  const account = useWalletStore((state) => state.account);
  const load = useWalletStore((state) => state.load);
  const [symbol, setSymbol] = useState<TokenSymbol>('ALLI');

  useEffect(() => {
    if (!account) void load();
  }, [account, load]);

  if (!account) {
    return (
      <Screen>
        <ScreenHeader eyebrow={chain.name} title="Receive" back />
        <EmptyState title="No wallet yet" body="Sign in to create a wallet before receiving funds." />
      </Screen>
    );
  }

  const copy = async (text: string, what = 'Address copied') => {
    await Clipboard.setStringAsync(text);
    toast(what, 'ok');
  };
  const alli = tokenMeta('ALLI');

  return (
    <Screen>
      <ScreenHeader eyebrow={chain.name} title="Receive" back />

      <Segmented
        options={[
          { value: 'ALLI', label: 'ALLI' },
          { value: 'USDT', label: 'USDT' },
          { value: 'BNB', label: 'BNB' },
        ]}
        value={symbol}
        onChange={setSymbol}
      />

      <View style={styles.qrWrap}>
        <View style={styles.qr} accessibilityLabel={`QR code for ${account.address}`}>
          <QRCode value={account.address} size={196} color={colors.ink} backgroundColor={colors.raised} ecl="H" />
          <View style={styles.qrLogo}>
            <Logo size={40} />
          </View>
        </View>
      </View>

      <Text variant="label" color={colors.inkFaint}>
        Your address · {symbol === 'BNB' ? 'BNB for gas' : `${symbol} (BEP-20)`}
      </Text>
      <Text style={styles.address} selectable>
        {account.address}
      </Text>

      <View style={styles.pair}>
        <Button label="Copy address" variant="secondary" onPress={() => void copy(account.address)} style={styles.flex} />
        <Button
          label="Share"
          variant="secondary"
          onPress={() => void Share.share({ message: account.address }).catch(() => undefined)}
          style={styles.flex}
        />
      </View>

      <Card tone="warn" style={styles.notice}>
        <Text variant="caption" color={colors.inkDim}>
          <Text variant="bodyStrong" color={colors.warn}>
            !{' '}
          </Text>
          Only send BEP-20 tokens on {chain.name} to this address. Other networks = lost funds.
        </Text>
      </Card>

      <Card style={styles.helper}>
        <Text variant="label" color={colors.inkFaint}>
          Add ALLI to MetaMask
        </Text>
        <Text variant="caption" color={colors.inkDim}>
          Import a custom token on {chain.name} (chain ID {chain.chainId}) with this contract address,
          symbol ALLI and {alli.decimals} decimals.
        </Text>
        {alli.address ? (
          <Button label={alli.address} variant="ghost" size="sm" onPress={() => void copy(alli.address!, 'Contract address copied')} />
        ) : (
          <Text variant="mono" color={colors.inkFaint}>
            Contract address published at token launch.
          </Text>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  qrWrap: { alignItems: 'center', paddingVertical: spacing.xl },
  qr: {
    padding: 20,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrLogo: { position: 'absolute', padding: 4, borderRadius: 12, backgroundColor: colors.raised },
  address: { fontFamily: fonts.monoMedium, fontSize: 13, color: colors.ink, marginTop: spacing.sm, marginBottom: spacing.lg },
  pair: { flexDirection: 'row', gap: 10 },
  notice: { marginTop: 14 },
  helper: { gap: spacing.sm, marginTop: 14 },
});
