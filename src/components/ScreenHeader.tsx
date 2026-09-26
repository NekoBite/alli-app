import { router } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { Eyebrow } from './Eyebrow';
import { Text } from './Text';

type Props = {
  eyebrow?: string;
  title: string;
  /** Right-hand slot: avatar, a BETA / COMING SOON badge, a cart count. */
  right?: ReactNode;
  /**
   * Pushed screens get a back box and the smaller title. Pass a function to override where back
   * goes (a flow that should not return to the previous step).
   */
  back?: boolean | (() => void);
};

/**
 * The in-content header every wireframe screen uses in place of a navigation bar: an eyebrow over
 * a Space Grotesk title, with a back box on pushed screens.
 */
export function ScreenHeader({ eyebrow, title, right, back }: Props) {
  const onBack = typeof back === 'function' ? back : () => router.back();
  return (
    <View style={styles.root}>
      {back ? <BackButton onPress={onBack} /> : null}
      <View style={styles.stack}>
        {eyebrow ? <Eyebrow label={eyebrow} /> : null}
        <Text variant={back ? 'heading' : 'title'} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.back, pressed && { opacity: 0.7 }]}
    >
      <Text variant="bodyStrong" style={styles.arrow}>
        ←
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  stack: { flex: 1, gap: 6 },
  right: { alignItems: 'flex-end' },
  back: {
    width: 38,
    height: 38,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.ghostFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { fontSize: 17, lineHeight: 21 },
});

