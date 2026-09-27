import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  ListRow,
  ProgressBar,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatTile,
  Text,
  toast,
} from '@/components';
import { formatCount, progressFraction, qualifies, standing } from '@/features/quests/quests';
import { METRIC_LABEL } from '@/features/quests/rules';
import { useQuestStore } from '@/features/quests/store';
import { colors, spacing } from '@/theme';
import { formatStars } from '@/utils/format';
import { isoWeek } from '@/utils/time';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** 2.7 Weekly quest — one community goal, shared by everyone; resets Monday 00:00 UTC. */
export default function WeeklyQuestScreen() {
  const { snapshot, loading, error, refresh, share } = useQuestStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onShare = async () => {
    const result = await share();
    if (result === 'copied') toast('Progress message copied');
  };

  if (!snapshot) {
    return (
      <Screen onRefresh={() => void refresh()} refreshing={loading}>
        <ScreenHeader title="Weekly quest" back />
        <EmptyState
          title={error ? 'Could not load the quest' : 'Loading the week'}
          body={error ?? 'One goal for the whole community, every week.'}
          actionLabel="Retry"
          onAction={() => void refresh()}
        />
      </Screen>
    );
  }

  const { quest, community, contributors, mine } = snapshot.current;
  const { last } = snapshot;
  const stayUnder = quest.kind === 'stayUnder';
  const fraction = progressFraction(snapshot.current);
  const where = standing(snapshot.current);
  const did = qualifies(quest, mine);
  const unit = METRIC_LABEL[quest.metric];
  const end = new Date(quest.weekEnd - 60_000);
  const endLabel = `${DAYS[end.getUTCDay()]} ${String(end.getUTCHours()).padStart(2, '0')}:${String(end.getUTCMinutes()).padStart(2, '0')} UTC`;
  const week = isoWeek(quest.weekStart);

  const tiers = [
    {
      key: 'goal',
      glyph: '1',
      title: `${stayUnder ? 'Stay under' : 'Reach'} ${formatCount(quest.goal)} ${unit}`,
      reached: where === 'goal' || where === 'stretch',
      stars: quest.reward.stars,
    },
    ...(quest.stretchGoal !== undefined
      ? [
          {
            key: 'stretch',
            glyph: '2',
            title: `Stretch · ${formatCount(quest.stretchGoal)} ${unit}`,
            reached: where === 'stretch',
            stars: quest.reward.stretchStars,
          },
        ]
      : []),
  ];

  return (
    <Screen
      onRefresh={() => void refresh()}
      refreshing={loading}
      footer={
        <View style={styles.pair}>
          <Button label="Share" variant="secondary" onPress={() => void onShare()} style={styles.flex} />
          <Button
            label={quest.metric === 'steps' ? 'Start a run' : 'Open garden'}
            onPress={() => router.push(quest.metric === 'steps' ? '/run/active' : '/(tabs)/garden')}
            style={styles.flex}
          />
        </View>
      }
    >
      <ScreenHeader eyebrow={`Week ${week} · ends ${endLabel}`} title="Weekly quest" back />

      <Card tone="hero" style={styles.gap}>
        <Text variant="heading" style={styles.title}>
          {quest.title}
        </Text>
        <ProgressBar progress={fraction} color={stayUnder && fraction > 0.8 ? colors.warn : undefined} />
        <View style={styles.baseline}>
          <Text variant="title">{formatCount(community)}</Text>
          <Text variant="mono" color={colors.inkFaint}>
            of {formatCount(quest.goal)} · {Math.round(fraction * 100)}%
          </Text>
        </View>
        <View style={styles.stats}>
          <StatTile label="Players" value={formatCount(contributors)} />
          <StatTile
            label={`Your ${unit}`}
            value={formatCount(mine)}
            color={did ? colors.ok : colors.ink}
            sub={`${stayUnder ? 'at most' : 'at least'} ${formatCount(quest.personal)}`}
          />
        </View>
      </Card>

      <View style={styles.section}>
        <SectionHeader title="Reward tiers · everyone who did their part" />
        <Card style={styles.tight}>
          {tiers.map((t) => (
            <ListRow
              key={t.key}
              glyph={t.glyph}
              glyphTone={t.reached ? 'solid' : 'outline'}
              title={t.title}
              subtitle={t.reached ? 'Reached — pays when the week closes' : 'Locked'}
              value={`+${formatStars(t.stars)} ★`}
              valueSub={t.reached ? (did ? 'you qualify' : 'do your part') : 'locked'}
              valueColor={t.reached ? colors.ok : colors.inkDim}
            />
          ))}
        </Card>
      </View>

      <Card style={styles.gap}>
        <Text variant="label" color={colors.redHot}>
          How to contribute
        </Text>
        <Text variant="body" color={colors.inkDim}>
          {quest.howTo}
        </Text>
        <Text variant="caption" color={colors.inkFaint}>
          {quest.lesson}
        </Text>
      </Card>

      {last ? (
        <View style={styles.section}>
          <SectionHeader title="Last week" />
          <Card style={styles.tight}>
            <ListRow
              glyph="✓"
              glyphTone={last.outcome === 'none' ? 'faint' : 'outline'}
              title={last.quest.title}
              subtitle={
                last.outcome === 'none'
                  ? 'The community fell short'
                  : last.outcome === 'stretch'
                    ? 'Stretch goal reached'
                    : 'Goal reached'
              }
              value={last.paidStars > 0 ? `+${formatStars(last.paidStars)} ★` : '—'}
              valueSub={last.qualified ? 'paid' : 'not qualified'}
              valueColor={last.paidStars > 0 ? colors.ok : colors.inkDim}
            />
          </Card>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.md },
  title: { fontSize: 22, lineHeight: 28 },
  baseline: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  stats: { flexDirection: 'row', gap: spacing.sm },
  section: { marginVertical: spacing.lg },
  tight: { paddingVertical: 6 },
  pair: { flexDirection: 'row', gap: 10 },
});
