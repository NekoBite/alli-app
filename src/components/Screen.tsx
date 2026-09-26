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
import { Glow } from './Glow';

type Props = {
  children: ReactNode;
  /** Set false for screens that own their own scrolling (e.g. a FlatList). */
  scroll?: boolean;
  /** Extra bottom padding so content clears the tab bar. */
  footerSpace?: number;
  /**
   * A docked action area under the scroll view (the wireframes' bottom CTA, above a hairline).
   * It sits outside the scroll so the CTA never moves.
   */
  footer?: ReactNode;
  /** Tab screens: the tab bar already clears the home indicator. */
  inTabs?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  style?: ViewStyle;
};

/**
 * Standard screen shell: brand background with the top-left glow, safe-area padding, optional
 * scroll and docked footer. Screens draw their own header (`ScreenHeader`); the navigators hide
 * theirs.
 */
export function Screen({
  children,
  scroll = true,
  footerSpace = 0,
  footer,
  inTabs,
  onRefresh,
  refreshing = false,
  style,
}: Props) {
  const insets = useSafeAreaInsets();
  const bottomInset = inTabs ? 0 : insets.bottom;
  const padding: ViewStyle = {
    paddingTop: insets.top + spacing.sm,
    paddingHorizontal: spacing.gutter,
    paddingBottom: (footer ? spacing.lg : bottomInset + spacing.xl) + footerSpace,
  };

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[padding, style]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.redHot} />
        ) : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padding, style]}>{children}</View>
  );

  return (
    <View style={styles.root}>
      <Glow />
      {body}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: bottomInset + spacing.lg }]}>{footer}</View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, overflow: 'hidden' },
  flex: { flex: 1 },
  footer: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.gutter,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
    gap: spacing.sm,
  },
});
