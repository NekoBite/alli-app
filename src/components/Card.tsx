import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';

type Tone = 'default' | 'hero' | 'accent' | 'warn' | 'ok' | 'muted';

type Props = {
  children: ReactNode;
  onPress?: () => void;
  /**
   * `default` is the raised card; `hero` the one-step-up card that holds a screen's main figure;
   * `accent` the red-tinted invite banner; `warn` the amber notice (backups, network warnings).
   */
  tone?: Tone;
  /** Selected state for pickable cards (seed, run pack). */
  selected?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function Card({
  children,
  onPress,
  tone = 'default',
  selected,
  disabled,
  style,
  accessibilityLabel,
}: Props) {
  const composed = [styles.base, tones[tone], selected && styles.selected, disabled && styles.disabled, style];

  if (!onPress) {
    return <View style={composed}>{children}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [...composed, pressed && !disabled && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

const tones = StyleSheet.create({
  default: { backgroundColor: colors.raised, borderColor: colors.line },
  hero: { backgroundColor: colors.raised2, borderColor: colors.lineStrong },
  accent: { backgroundColor: colors.redFill, borderColor: 'rgba(255, 106, 61, 0.6)' },
  warn: { backgroundColor: colors.warnFill, borderColor: 'rgba(232, 184, 75, 0.35)' },
  ok: { backgroundColor: colors.okFill, borderColor: 'rgba(63, 190, 122, 0.35)' },
  muted: { backgroundColor: colors.raised, borderColor: 'rgba(246, 238, 234, 0.06)' },
});

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: 17,
  },
  selected: { borderColor: colors.redHot, backgroundColor: colors.raised2 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.85 },
});
