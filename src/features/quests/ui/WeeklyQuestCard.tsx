import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, Pill, ProgressBar, Row, Text } from '@/components';
import { colors, spacing } from '@/theme';
import { formatStars } from '@/utils/format';
import { countdown } from '@/utils/time';
import { formatCount, msLeft, outcome, progressFraction, qualifies, rewardLine, standing } from '../quests';
import { METRIC_LABEL } from '../rules';
import type { QuestSnapshot } from '../types';

type Props = {
  snapshot: QuestSnapshot;
  onOpen?: () => void;
  onShare?: () => void;
};

/** The community's week at a glance: the bar, your part, the reward, last week. */
export function WeeklyQuestCard({ snapshot, onOpen, onShare }: Props) {
  const { current, last, serverTime } = snapshot;
  const { quest, community, contributors, mine } = current;
  const fraction = progressFraction(current);
  const state = outcome(current, serverTime);
  const where = standing(current);
  const done = qualifies(quest, mine);
  const stayUnder = quest.kind === 'stayUnder';
  const barColor = stayUnder
    ? fraction > 0.8
      ? colors.danger
      : colors.teal
    : where === 'none'
      ? colors.cyan
      : colors.green;

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.titles}>
          <Text variant="label" color={colors.ink2}>
            Weekly quest · everyone together
          </Text>
          <Text variant="heading">{quest.title}</Text>
        </View>
        <Pill
          label={
            state === 'open'
              ? where === 'none'
                ? `Ends in ${countdown(msLeft(quest, serverTime))}`
                : where === 'stretch'
                  ? 'Stretch reached'
                  : 'Goal reached'
              : state === 'none'
                ? 'Missed'
                : state === 'stretch'
                  ? 'Stretch reached'
                  : 'Goal reached'
          }
          color={where === 'none' && state !== 'open' ? colors.danger : where === 'none' ? colors.ink2 : where === 'stretch' ? colors.gold : colors.green}
          dot
        />
      </View>

      <Text variant="caption" color={colors.ink2}>
        {quest.blurb}
      </Text>

      <ProgressBar progress={fraction} color={barColor} height={10} />
      <View style={styles.numbers}>
        <Text variant="caption" color={colors.ink2}>
          {stayUnder
            ? `${formatCount(community)} of a ${formatCount(quest.goal)} cap`
            : `${formatCount(community)} / ${formatCount(quest.goal)} ${METRIC_LABEL[quest.metric]}`}
          {quest.stretchGoal !== undefined ? ` · stretch ${formatCount(quest.stretchGoal)}` : ''}
        </Text>
        <Text variant="caption" color={colors.ink2}>
          {contributors} players in
        </Text>
      </View>

      <Row
        label={stayUnder ? 'Your synthetic uses' : 'Your part'}
        value={
          stayUnder
            ? `${formatCount(mine)} · keep it at ${quest.personal}`
            : `${formatCount(mine)} of ${formatCount(quest.personal)}`
        }
        valueColor={done ? colors.green : colors.warning}
      />
      <Row label="Reward" value={rewardLine(quest)} valueColor={colors.gold} />

      {last ? (
        <Text variant="caption" color={colors.ink3}>
          Last week, {last.quest.title}:{' '}
          {last.outcome === 'none'
            ? 'missed'
            : last.outcome === 'stretch'
              ? 'stretch reached'
              : 'goal reached'}
          {last.qualified && last.paidStars > 0
            ? ` · you were paid ${formatStars(last.paidStars)} ★`
            : last.outcome !== 'none'
              ? ' · you did not do your part'
              : ''}
          .
        </Text>
      ) : null}

      {onOpen || onShare ? (
        <View style={styles.actions}>
          {onShare ? (
            <Button label="Share progress" variant="secondary" onPress={onShare} style={styles.action} />
          ) : null}
          {onOpen ? <Button label="Details" variant="ghost" onPress={onOpen} style={styles.action} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

/** One line for the top of the garden: enough to know whether to act today. */
export function WeeklyQuestStrip({ snapshot, onOpen }: { snapshot: QuestSnapshot; onOpen: () => void }) {
  const { current, serverTime } = snapshot;
  const pct = Math.round(progressFraction(current) * 100);
  const done = qualifies(current.quest, current.mine);
  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={styles.strip}>
      <Text variant="caption" color={colors.ink2} numberOfLines={1} style={styles.stripText}>
        Weekly quest · {current.quest.title} · {pct}% · you {formatCount(current.mine)}
      </Text>
      <Text variant="caption" color={done ? colors.green : colors.warning}>
        {done ? '✓' : countdown(msLeft(current.quest, serverTime))}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  titles: { flex: 1, gap: 2 },
  numbers: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingTop: spacing.xs },
  action: { flex: 1 },
  strip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
  stripText: { flex: 1 },
});
