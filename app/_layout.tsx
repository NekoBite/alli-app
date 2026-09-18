// Must come first: ethers needs crypto.getRandomValues, which Hermes lacks.
import '@/polyfills';
// Registers the background location task. The OS can wake it into a process
// that has no React tree, so it has to be defined at import time, here.
import '@/features/run/background';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAuthStore } from '@/features/auth/store';
import { colors, type } from '@/theme';

export default function RootLayout() {
  const status = useAuthStore((state) => state.status);
  const restore = useAuthStore((state) => state.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  // Until the stored session has been read, nothing is reachable, so the
  // signed-in routes do not flash before a redirect to sign-in.
  const signedIn = status === 'signedIn';
  const signedOut = status === 'signedOut';

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTitleStyle: { ...type.heading, color: colors.ink },
          headerTintColor: colors.green,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Protected guard={signedOut}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="run/active"
            options={{ title: 'Active run', headerBackVisible: false }}
          />
          <Stack.Screen name="run/summary" options={{ title: 'Run summary' }} />
          <Stack.Screen name="run/credits" options={{ title: 'Run credits' }} />
          <Stack.Screen name="run/stars" options={{ title: 'Stars' }} />
          <Stack.Screen name="garden/shop" options={{ title: 'Seed shop' }} />
          <Stack.Screen name="garden/plot/[id]" options={{ title: 'Tree' }} />
          <Stack.Screen
            name="garden/minigame/[game]"
            options={{ title: 'Minigame', presentation: 'modal' }}
          />
          <Stack.Screen name="quests/weekly" options={{ title: 'Weekly quest' }} />
          <Stack.Screen name="market/product/[id]" options={{ title: 'Product' }} />
          <Stack.Screen name="market/cart" options={{ title: 'Cart' }} />
          <Stack.Screen name="market/checkout" options={{ title: 'Checkout' }} />
          <Stack.Screen name="wallet/send" options={{ title: 'Send', presentation: 'modal' }} />
          <Stack.Screen name="wallet/receive" options={{ title: 'Receive', presentation: 'modal' }} />
          <Stack.Screen name="wallet/card" options={{ title: 'Visa card' }} />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
  );
}
