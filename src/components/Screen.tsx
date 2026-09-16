import { type ReactNode } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

type Props = {
  children: ReactNode;
  /** Set false for screens that own their own scrolling (e.g. a FlatList). */
  scroll?: boolean;
  /** Extra bottom padding so content clears the tab bar / a docked CTA. */
  footerSpace?: number;
  onRefresh?: () => void;
  refreshing?: boolean;
  style?: ViewStyle;
};

/** Standard screen shell: brand background, safe-area padding, optional scroll. */
export function Screen({
  children,
  scroll = true,
  footerSpace = 0,
  onRefresh,
  refreshing = false,
  style,
}: Props) {
  const insets = useSafeAreaInsets();
  const padding: ViewStyle = {
    paddingHorizontal: spacing.lg,
    paddingBottom: insets.bottom + spacing.xl + footerSpace,
  };

  if (!scroll) {
    return <View style={[styles.root, padding, style]}>{children}</View>;
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[padding, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh
          ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.green} />
          : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});
