import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import {
  BackButton,
  Button,
  Divider,
  Eyebrow,
  Field,
  Logo,
  Pill,
  Screen,
  Text,
  toast,
} from '@/components';
import { isMock } from '@/config/env';
import { useOAuth } from '@/features/auth/oauth';
import { useAuthStore } from '@/features/auth/store';
import { authApi, type OAuthCode } from '@/services/api';
import { colors, fonts, radius, spacing } from '@/theme';

/** Seconds before "Resend" comes back. The server rate-limits too; this only keeps the UI honest. */
const RESEND_AFTER = 60;

/** 1.1 Sign in → 1.2 Verify code. One route: the code step is the same screen with an email held. */
export default function SignInScreen() {
  const pendingEmail = useAuthStore((s) => s.pendingEmail);
  return pendingEmail ? <VerifyCode email={pendingEmail} /> : <EnterEmail />;
}

function EnterEmail() {
  const { busy, error, requestCode, signInWithProvider, referralCode } = useAuthStore();
  const [email, setEmail] = useState('');

  const onProvider = async (input: OAuthCode) => {
    try {
      await signInWithProvider(input);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };
  const google = useOAuth('google', onProvider);
  const facebook = useOAuth('facebook', onProvider);
  const x = useOAuth('x', onProvider);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const onSendCode = async () => {
    try {
      await requestCode(email);
    } catch {
      // The store holds the message; it renders under the field.
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
      <Screen>
        <View style={styles.logo}>
          <Logo size={56} />
        </View>
        <View style={styles.hero}>
          <Eyebrow label="Welcome to ALLI" />
          <Text variant="hero" style={styles.headline}>
            Walk. <Text variant="hero" color="#F6B49E" style={styles.headline}>Grow.</Text>{' '}
            <Text variant="hero" color={colors.redHot} style={styles.headline}>Earn.</Text>
          </Text>
          <Text variant="body" color={colors.inkDim}>
            Walk 6,000 GPS-verified steps a day, grow a tree, and earn ALLI on BNB Smart Chain.
          </Text>
          <Pill kind="status" color={colors.ok} label="Free wallet + Leather NFT shoe on sign-up" />
          {referralCode ? (
            <Pill kind="status" color={colors.redHot} label={`Invited with ${referralCode}`} />
          ) : null}
        </View>

        <View style={styles.form}>
          <Field
            label="Sign in with email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            returnKeyType="send"
            onSubmitEditing={() => emailValid && void onSendCode()}
            accessibilityLabel="Email address"
            error={error}
          />
          <Button
            label="Send me a code"
            loading={busy}
            disabled={!emailValid}
            onPress={() => void onSendCode()}
          />
        </View>

        <View style={styles.providers}>
          <Divider label="or continue with" />
          <Button
            label={`Continue with ${google.label}`}
            variant="secondary"
            size="lg"
            disabled={busy || !google.available}
            onPress={() => void google.prompt()}
            icon={
              <Text style={styles.g} color={colors.redHot}>
                G
              </Text>
            }
          />
          <View style={styles.pair}>
            {[facebook, x].map((provider) => (
              <Button
                key={provider.label}
                label={provider.label}
                variant="secondary"
                size="lg"
                disabled={busy || !provider.available}
                onPress={() => void provider.prompt()}
                style={styles.flex}
              />
            ))}
          </View>
          <Text variant="caption" color={colors.inkFaint} center style={styles.small}>
            Provider buttons grey out when their client ID is not configured. Your session token
            lives in the device keychain.
          </Text>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function VerifyCode({ email }: { email: string }) {
  const { busy, error, verifyCode, cancelCode } = useAuthStore();
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(RESEND_AFTER);
  const [shake] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const doShake = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    Animated.sequence(
      [10, -10, 7, -7, 0].map((toValue) =>
        Animated.timing(shake, { toValue, duration: 55, useNativeDriver: true }),
      ),
    ).start();
  };

  const submit = async (value: string) => {
    try {
      await verifyCode(value);
    } catch {
      setCode('');
      doShake();
    }
  };

  const press = (key: string) => {
    if (key === '⌫') return setCode((c) => c.slice(0, -1));
    setCode((c) => (c.length < 6 ? c + key : c));
  };

  const paste = async () => {
    const text = (await Clipboard.getStringAsync().catch(() => '')).replace(/\D/g, '');
    if (text.length === 6) setCode(text);
    else toast('No six-digit code on the clipboard');
  };

  const resend = async () => {
    try {
      await authApi.requestCode(email);
      setWait(RESEND_AFTER);
      toast('A new code is on its way');
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  };

  const mm = Math.floor(wait / 60);
  const ss = String(wait % 60).padStart(2, '0');

  return (
    <Screen
      footer={
        <View style={styles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, i) =>
            key ? (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={key === '⌫' ? 'Delete' : key}
                onPress={() => press(key)}
                style={({ pressed }) => [styles.key, pressed && styles.keyPressed]}
              >
                <Text style={styles.keyText}>{key === '⌫' ? '←' : key}</Text>
              </Pressable>
            ) : (
              <View key={`gap-${i}`} style={[styles.key, styles.keyGap]} />
            ),
          )}
        </View>
      }
    >
      <View style={styles.back}>
        <BackButton onPress={cancelCode} />
      </View>
      <View style={styles.hero}>
        <Eyebrow label="Step 2 of 2" />
        <Text variant="title">Check your email</Text>
        <Text variant="body" color={colors.inkDim}>
          We sent a 6-digit code to {email}. It expires in 10 minutes.
          {isMock ? ' Mock mode: any six digits will do.' : ''}
        </Text>
      </View>

      <Pressable
        onLongPress={() => void paste()}
        accessibilityLabel={`Code, ${code.length} of 6 digits entered. Long-press to paste.`}
      >
        <Animated.View style={[styles.boxes, { transform: [{ translateX: shake }] }]}>
          {Array.from({ length: 6 }, (_, i) => {
            const active = i === code.length;
            return (
              <View key={i} style={[styles.box, active && styles.boxActive, !!error && styles.boxError]}>
                <Text style={styles.digit}>{code[i] ?? (active ? '|' : '')}</Text>
              </View>
            );
          })}
        </Animated.View>
      </Pressable>
      {error ? (
        <Text variant="caption" color={colors.danger} style={styles.error}>
          {error}
        </Text>
      ) : null}

      <View style={styles.form}>
        <Button
          label="Sign in"
          loading={busy}
          disabled={code.length !== 6}
          onPress={() => void submit(code)}
        />
        <View style={styles.resend}>
          <Text variant="caption" color={colors.inkDim}>
            Didn&apos;t get it?
          </Text>
          {wait > 0 ? (
            <Text variant="mono" color={colors.inkFaint}>
              Resend in {mm}:{ss}
            </Text>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => void resend()} hitSlop={8}>
              <Text variant="mono" color={colors.redHot}>
                Resend code
              </Text>
            </Pressable>
          )}
        </View>
        <Button label="Use a different email" variant="secondary" onPress={cancelCode} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  logo: { marginTop: spacing.xl, marginBottom: spacing.xl },
  hero: { gap: spacing.md, marginBottom: spacing.xl },
  headline: { fontSize: 40, lineHeight: 48, letterSpacing: -0.6 },
  form: { gap: spacing.md },
  providers: { gap: spacing.md, marginTop: spacing.xl },
  pair: { flexDirection: 'row', gap: 10 },
  g: { fontFamily: fonts.display, fontSize: 16 },
  small: { fontSize: 12, marginTop: spacing.xs },
  back: { marginTop: spacing.xl, marginBottom: spacing.xxl },
  boxes: { flexDirection: 'row', gap: 10, marginBottom: spacing.sm },
  box: {
    flex: 1,
    aspectRatio: 0.82,
    maxHeight: 58,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxActive: { borderColor: colors.redHot },
  boxError: { borderColor: colors.danger },
  digit: { fontFamily: fonts.display, fontSize: 24, color: colors.ink },
  error: { marginBottom: spacing.sm },
  resend: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm },
  keypad: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, justifyContent: 'space-between' },
  key: {
    width: '31.5%',
    height: 48,
    borderRadius: 10,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: { backgroundColor: colors.raised2 },
  keyGap: { backgroundColor: 'transparent' },
  keyText: { fontFamily: fonts.displayMedium, fontSize: 22, color: colors.ink },
});
