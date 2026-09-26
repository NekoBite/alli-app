import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components';
import { colors, spacing } from '@/theme';
import { countdown } from '@/utils/time';
import { formatCount, msLeft, progressFraction, qualifies } from '../quests';
import type { QuestSnapshot } from '../types';

/** One line for the top of the garden: enough to know whether to act today. */
export function WeeklyQuestStrip({ snapshot, onOpen }: { snapshot: QuestSnapshot; onOpen: () => void }) {
  const { current, serverTime } = snapshot;
  const pct = Math.round(progressFraction(current) * 100);
  const done = qualifies(current.quest, current.mine);
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={styles.strip}>
      <Text variant="caption" color={colors.inkDim} numberOfLines={1} style={styles.stripText}>
        Weekly quest · {current.quest.title} · {pct}% · you {formatCount(current.mine)}
      </Text>
      <Text variant="caption" color={done ? colors.ok : colors.warn}>
        {done ? '✓' : countdown(msLeft(current.quest, serverTime))}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.gutter,
    paddingVertical: spacing.sm,
    backgroundColor: colors.raised,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  stripText: { flex: 1 },
});
