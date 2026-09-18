import { useEffect } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button, Card, EmptyState, Row, Screen, Text } from '@/components';
import { formatCount, rewardLine } from '@/features/quests/quests';
import { METRIC_LABEL } from '@/features/quests/rules';
import { useQuestStore } from '@/features/quests/store';
import { WeeklyQuestCard } from '@/features/quests/ui';
import { colors, spacing } from '@/theme';

export default function WeeklyQuestScreen() {
  const { snapshot, loading, error, refresh, share } = useQuestStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onShare = async () => {
    const result = await share();
    if (result === 'copied') Alert.alert('Copied', 'The progress message is on your clipboard.');
  };

  if (!snapshot) {
    return (
      <Screen onRefresh={() => void refresh()} refreshing={loading}>
        <EmptyState
          title={error ? 'Could not load the quest' : 'Loading the week'}
          body={error ?? 'One goal for the whole community, every week.'}
          actionLabel="Retry"
          onAction={() => void refresh()}
        />
      </Screen>
    );
  }

  const { quest } = snapshot.current;
  const stayUnder = quest.kind === 'stayUnder';

  return (
    <Screen onRefresh={() => void refresh()} refreshing={loading}>
      <View style={styles.top}>
        <WeeklyQuestCard snapshot={snapshot} />
      </View>

      <Card style={styles.card}>
        <Text variant="heading">How to contribute</Text>
        <Text variant="body" color={colors.ink2}>
          {quest.howTo}
        </Text>
        <Text variant="caption" color={colors.ink3}>
          Counted by the server from what you do in the app. Nothing to submit.
        </Text>
      </Card>

      <Card style={styles.card} tone="muted">
        <Text variant="label" color={colors.teal}>
          Why it matters
        </Text>
        <Text variant="body">{quest.lesson}</Text>
      </Card>

      <Card style={styles.card}>
        <Text variant="heading">The deal</Text>
        <Row
          label={stayUnder ? 'Community cap' : 'Community goal'}
          value={`${formatCount(quest.goal)} ${METRIC_LABEL[quest.metric]}`}
        />
        {quest.stretchGoal !== undefined ? (
          <Row
            label={stayUnder ? 'Stretch cap' : 'Stretch goal'}
            value={`${formatCount(quest.stretchGoal)} ${METRIC_LABEL[quest.metric]}`}
            valueColor={colors.gold}
          />
        ) : null}
        <Row
          label="Your part"
          value={
            stayUnder
              ? `At most ${formatCount(quest.personal)}`
              : `At least ${formatCount(quest.personal)}`
          }
        />
        <Row label="Reward" value={rewardLine(quest)} valueColor={colors.gold} />
        {quest.reward.carbonDelta !== 0 ? (
          <Row
            label="Carbon score"
            value={`${quest.reward.carbonDelta} to every garden that did its part`}
            valueColor={colors.teal}
          />
        ) : null}
        <Text variant="caption" color={colors.ink3}>
          Paid when the week closes, Monday 00:00 UTC, to everyone who did their part. One clock
          for the whole community, so the countdown means the same thing everywhere.
        </Text>
      </Card>

      <Button label="Share progress" size="lg" onPress={() => void onShare()} />
      <Text variant="caption" color={colors.ink3} center style={styles.note}>
        Post it where your community talks and decide the week&apos;s plan together.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: spacing.lg, marginBottom: spacing.lg },
  card: { gap: spacing.sm, marginBottom: spacing.lg },
  note: { marginTop: spacing.md },
});
