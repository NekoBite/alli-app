// Must come first: ethers needs crypto.getRandomValues, which Hermes lacks.
import '@/polyfills';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors, type } from '@/theme';

export default function RootLayout() {
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
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="jog/active" options={{ title: 'Run', headerBackVisible: false }} />
        <Stack.Screen name="jog/summary" options={{ title: 'Run summary' }} />
        <Stack.Screen name="garden/shop" options={{ title: 'Seed shop' }} />
        <Stack.Screen name="garden/plot/[id]" options={{ title: 'Tree' }} />
        <Stack.Screen name="market/product/[id]" options={{ title: 'Product' }} />
        <Stack.Screen name="market/cart" options={{ title: 'Cart' }} />
        <Stack.Screen name="market/checkout" options={{ title: 'Checkout' }} />
        <Stack.Screen name="wallet/send" options={{ title: 'Send', presentation: 'modal' }} />
        <Stack.Screen name="wallet/receive" options={{ title: 'Receive', presentation: 'modal' }} />
        <Stack.Screen name="wallet/card" options={{ title: 'Visa card' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
