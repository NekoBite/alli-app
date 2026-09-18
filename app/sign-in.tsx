import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, Text } from '@/components';
import { isMock } from '@/config/env';
import { useOAuth } from '@/features/auth/oauth';
import { useAuthStore } from '@/features/auth/store';
import type { OAuthCode } from '@/services/api';
import { colors, radius, spacing, type } from '@/theme';

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { pendingEmail, busy, error, requestCode, verifyCode, signInWithProvider, cancelCode } =
    useAuthStore();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const onProvider = async (input: OAuthCode) => {
    try {
      await signInWithProvider(input);
    } catch (e) {
      Alert.alert('Could not sign in', (e as Error).message);
    }
  };
  const google = useOAuth('google', onProvider);
  const facebook = useOAuth('facebook', onProvider);
  const x = useOAuth('x', onProvider);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const onSendCode = async () => {
    try {
      await requestCode(email);
    } catch (e) {
      Alert.alert('Could not send a code', (e as Error).message);
    }
  };

  const onVerify = async () => {
    try {
      await verifyCode(code);
    } catch (e) {
      Alert.alert('Could not sign in', (e as Error).message);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.root, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}
    >
      <View style={styles.hero}>
        <Text variant="label" color={colors.green}>
          ALLI
        </Text>
        <Text variant="hero">Walk. Grow. Earn.</Text>
        <Text variant="body" color={colors.ink2}>
          Sign in to keep your stars, your trees and your place in this week&apos;s quest.
        </Text>
      </View>

      <Card style={styles.card}>
        {pendingEmail ? (
          <>
            <Text variant="heading">Check your email</Text>
            <Text variant="caption" color={colors.ink2}>
              We sent a six-digit code to {pendingEmail}.
              {isMock ? ' Mock mode: any six digits will do.' : ''}
            </Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="123456"
              placeholderTextColor={colors.ink3}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              style={styles.input}
              accessibilityLabel="Sign-in code"
            />
            <Button
              label="Sign in"
              size="lg"
              loading={busy}
              disabled={!/^\d{6}$/.test(code)}
              onPress={() => void onVerify()}
            />
            <Button label="Use a different email" variant="ghost" onPress={cancelCode} />
          </>
        ) : (
          <>
            <Text variant="heading">Sign in with email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.ink3}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              style={styles.input}
              accessibilityLabel="Email address"
            />
            <Button
              label="Send me a code"
              size="lg"
              loading={busy}
              disabled={!emailValid}
              onPress={() => void onSendCode()}
            />
          </>
        )}
        {error ? (
          <Text variant="caption" color={colors.danger}>
            {error}
          </Text>
        ) : null}
      </Card>

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text variant="caption" color={colors.ink3}>
          or continue with
        </Text>
        <View style={styles.line} />
      </View>

      <View style={styles.providers}>
        {[google, facebook, x].map((provider) => (
          <Button
            key={provider.label}
            label={provider.label}
            variant="secondary"
            disabled={busy || !provider.available}
            onPress={() => void provider.prompt()}
            style={styles.provider}
          />
        ))}
      </View>
      {!google.available || !facebook.available || !x.available ? (
        <Text variant="caption" color={colors.ink3} center>
          A greyed-out provider has no client id configured for this build.
        </Text>
      ) : null}

      <Text variant="caption" color={colors.ink3} center style={styles.legal}>
        No passwords. A code by email or a provider you already trust, and a session this app
        keeps in the device keychain.
      </Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, gap: spacing.lg },
  hero: { gap: spacing.sm },
  card: { gap: spacing.md },
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
  divider: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.lineNeutral },
  providers: { flexDirection: 'row', gap: spacing.sm },
  provider: { flex: 1 },
  legal: { marginTop: 'auto' },
});
