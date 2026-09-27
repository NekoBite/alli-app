import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { Text } from './Text';

type Props = {
  title: string;
  /** Right-aligned mono note ("3 left today", "up to 5×"). */
  note?: string;
  actionLabel?: string;
  onAction?: () => void;
  color?: string;
};

/** Mono label over a group ("EARN COMPOST & PRACTICES", "BUY RUNS OUTRIGHT"). */
export function SectionHeader({ title, note, actionLabel, onAction, color = colors.inkFaint }: Props) {
  return (
    <View style={styles.root}>
      <Text variant="label" color={color} style={styles.title}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <Text variant="caption" color={colors.redHot}>
            {actionLabel} →
          </Text>
        </Pressable>
      ) : note ? (
        <Text variant="mono" color={colors.inkFaint} style={styles.note}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  title: { flex: 1 },
  note: { fontSize: 11 },
});
