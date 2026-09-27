import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { colors, radius, spacing } from '@/theme';
import { Text } from './Text';

type ToastState = {
  message: string | null;
  tone: 'default' | 'ok' | 'error';
  show: (message: string, tone?: ToastState['tone']) => void;
  clear: () => void;
};

const useToastStore = create<ToastState>((set) => ({
  message: null,
  tone: 'default',
  show: (message, tone = 'default') => set({ message, tone }),
  clear: () => set({ message: null }),
}));

/** Show a short confirmation ("Address copied", "Added to cart"). */
export const toast = (message: string, tone?: ToastState['tone']) =>
  useToastStore.getState().show(message, tone);

/** Mounted once in the root layout. */
export function ToastHost() {
  const { message, tone, clear } = useToastStore();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clear, 2200);
    return () => clearTimeout(t);
  }, [message, clear]);

  if (!message) return null;
  const border = tone === 'ok' ? colors.ok : tone === 'error' ? colors.danger : colors.redHot;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + spacing.sm }]}>
      <View accessibilityLiveRegion="polite" style={[styles.toast, { borderColor: border }]}>
        <Text variant="bodyStrong" style={styles.text}>
          {message}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.gutter, right: spacing.gutter, alignItems: 'center' },
  toast: {
    backgroundColor: colors.raised2,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  text: { fontSize: 14 },
});
