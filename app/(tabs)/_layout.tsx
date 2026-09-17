import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components';
import { colors, type } from '@/theme';

/**
 * Placeholder tab glyphs. Swap for a proper icon set (@expo/vector-icons, or
 * the brand's own SVGs via react-native-svg) once the icon assets exist.
 */
function TabGlyph({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={[styles.glyph, focused && styles.glyphActive]}>
      <Text variant="label" color={focused ? colors.onGreen : colors.ink2}>
        {label}
      </Text>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { ...type.heading, color: colors.ink },
        headerShadowVisible: false,
        tabBarStyle: styles.bar,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.ink2,
        tabBarLabelStyle: type.label,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ focused }) => <TabGlyph label="AL" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="run"
        options={{
          title: 'ALLI RUN',
          tabBarIcon: ({ focused }) => <TabGlyph label="AR" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="garden"
        options={{
          title: 'Garden',
          tabBarIcon: ({ focused }) => <TabGlyph label="GR" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="market"
        options={{
          title: 'Market',
          tabBarIcon: ({ focused }) => <TabGlyph label="MK" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarIcon: ({ focused }) => <TabGlyph label="WL" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.line,
    borderTopWidth: 1,
  },
  glyph: {
    width: 30,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },
  glyphActive: { backgroundColor: colors.green },
});
