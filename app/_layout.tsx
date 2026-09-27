// Must come first: ethers needs crypto.getRandomValues, which Hermes lacks.
import '@/polyfills';
// Registers the background location task. The OS can wake it into a process
// that has no React tree, so it has to be defined at import time, here.
import '@/features/run/background';

import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ToastHost } from '@/components';
import { useAuthStore } from '@/features/auth/store';
import { colors } from '@/theme';

/** Keyed by the family names in `src/theme/typography.ts`. */
const FONT_ASSETS = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_700Bold,
};

export default function RootLayout() {
  const status = useAuthStore((state) => state.status);
  const isNewAccount = useAuthStore((state) => state.isNewAccount);
  const restore = useAuthStore((state) => state.restore);
  // A font that fails to load falls back to the platform face; that is not worth a blank screen.
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);

  useEffect(() => {
    void restore();
  }, [restore]);

  // Until the stored session has been read, nothing is reachable, so the
  // signed-in routes do not flash before a redirect to sign-in.
  const signedIn = status === 'signedIn';
  const signedOut = status === 'signedOut';

  if (!fontsLoaded && !fontError) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          // Every screen draws its own header (ScreenHeader), as the wireframes do.
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Protected guard={signedOut}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && isNewAccount}>
          {/* 1.3 — shown once, straight after the sign-in that created the account. */}
          <Stack.Screen name="onboarding/wallet" options={{ gestureEnabled: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="run/active" options={{ gestureEnabled: false }} />
          <Stack.Screen name="run/summary" options={{ gestureEnabled: false }} />
          <Stack.Screen name="run/credits" />
          <Stack.Screen name="run/stars" />
          <Stack.Screen name="garden/shop" />
          <Stack.Screen name="garden/plot/[id]" />
          <Stack.Screen name="garden/minigame/[game]" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="quests/weekly" />
          <Stack.Screen name="market/product/[id]" />
          <Stack.Screen name="market/cart" />
          <Stack.Screen name="market/checkout" />
          <Stack.Screen name="market/order/[id]" options={{ gestureEnabled: false }} />
          <Stack.Screen name="wallet/send" />
          <Stack.Screen name="wallet/receive" />
          <Stack.Screen name="wallet/card" />
          <Stack.Screen name="referrals/index" />
          <Stack.Screen name="referrals/[program]/index" />
          <Stack.Screen name="referrals/[program]/tree" />
          <Stack.Screen name="referrals/share" />
        </Stack.Protected>
        {/* Invite links work signed in or out; the screen redirects either way. Declared last so
            it is never the stack's first (default) route. */}
        <Stack.Screen name="r/[code]" />
      </Stack>
      <ToastHost />
    </SafeAreaProvider>
  );
}
