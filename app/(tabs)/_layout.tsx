import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Gradient } from '@/components';
import { colors, fonts } from '@/theme';

/**
 * The wireframes' tab glyph: a rounded square, outlined when idle and filled with the primary
 * gradient when active. Swap for a proper icon set once the brand icons exist.
 */
function TabGlyph({ focused }: { focused: boolean }) {
  return focused ? <Gradient style={styles.glyph} /> : <View style={[styles.glyph, styles.idle]} />;
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: [styles.bar, { height: 76 + insets.bottom, paddingBottom: insets.bottom + 12 }],
        tabBarLabelPosition: 'below-icon',
        tabBarActiveTintColor: colors.redHot,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarLabelStyle: styles.label,
        tabBarIcon: ({ focused }) => <TabGlyph focused={focused} />,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Today' }} />
      <Tabs.Screen name="run" options={{ title: 'Run' }} />
      <Tabs.Screen name="garden" options={{ title: 'Garden' }} />
      <Tabs.Screen name="market" options={{ title: 'Market' }} />
      <Tabs.Screen name="wallet" options={{ title: 'Wallet' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.raised,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  glyph: { width: 24, height: 24, borderRadius: 8 },
  idle: { borderWidth: 1.5, borderColor: colors.inkFaint },
  label: { fontFamily: fonts.bodySemiBold, fontSize: 11, lineHeight: 16, marginTop: 4 },
});
