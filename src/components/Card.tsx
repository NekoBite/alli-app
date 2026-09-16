import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  /** Gold-tinted border for premium / USDT surfaces. */
  tone?: 'default' | 'premium' | 'muted';
  style?: ViewStyle;
};

export function Card({ children, onPress, tone = 'default', style }: Props) {
  const toneStyle =
    tone === 'premium' ? styles.premium : tone === 'muted' ? styles.muted : styles.default;

  if (!onPress) {
    return <View style={[styles.base, toneStyle, style]}>{children}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.base, toneStyle, pressed && styles.pressed, style]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
  },
  default: { borderColor: colors.line },
  premium: { borderColor: 'rgba(198, 166, 100, 0.35)', backgroundColor: colors.goldFill },
  muted: { borderColor: colors.lineNeutral },
  pressed: { opacity: 0.85 },
});
