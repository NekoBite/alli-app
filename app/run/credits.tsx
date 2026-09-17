import { useState } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Pill, Row, Screen, Text } from '@/components';
import {
  checkPurchase,
  extraRunsCost,
  membershipRemainingMs,
  remainingPurchasableRuns,
  RUN_CREDIT_RULES,
} from '@/features/run/credits';
import { useRunStore } from '@/features/run/store';
import { colors, radius, spacing, type } from '@/theme';
import { formatToken } from '@/utils/format';
import { countdown, formatDate } from '@/utils/time';

export default function RunCreditsScreen() {
  const { entitlement, buying, renewing, buyRuns, renewMembership } = useRunStore();
  const [count, setCount] = useState('');

  const parsed = Number(count);
  const runs = Number.isInteger(parsed) ? parsed : NaN;
  const check = Number.isNaN(runs) ? { ok: false } : checkPurchase(runs, entitlement);
  const remaining = remainingPurchasableRuns(entitlement.extraRunsBoughtThisMonth);
  const membership = entitlement.membership;
  const active = membership.status === 'active';

  const buy = async () => {
    try {
      await buyRuns(runs);
      setCount('');
      Alert.alert('Runs added', `${runs} run${runs === 1 ? '' : 's'} added to your balance.`);
    } catch (error) {
      Alert.alert('Could not buy runs', (error as Error).message);
    }
  };

  const renew = async () => {
    try {
      await renewMembership();
      Alert.alert(
        'Membership renewed',
        `${RUN_CREDIT_RULES.runsPerRenewal} run credits added to your balance.`,
      );
    } catch (error) {
      Alert.alert('Could not renew', (error as Error).message);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text variant="label" color={colors.ink2}>
          Runs left
        </Text>
        <Text variant="hero" color={entitlement.runsLeft > 0 ? colors.green : colors.warning}>
          {entitlement.runsLeft}
        </Text>
        <Text variant="caption" color={colors.ink2}>
          Credits never expire · {entitlement.runsThisMonth} run
          {entitlement.runsThisMonth === 1 ? '' : 's'} recorded this month
        </Text>
      </View>

      <Card style={styles.card}>
        <Text variant="heading">Buy extra runs</Text>
        <Text variant="caption" color={colors.ink2}>
          {formatToken(RUN_CREDIT_RULES.extraRunPriceUsdt, 'USDT')} per run. You can buy{' '}
          {remaining} more this month ({entitlement.extraRunsBoughtThisMonth} of{' '}
          {RUN_CREDIT_RULES.maxExtraRunsPerMonth} bought).
        </Text>

        <TextInput
          value={count}
          onChangeText={setCount}
          placeholder="Runs to buy"
          placeholderTextColor={colors.ink3}
          keyboardType="number-pad"
          style={styles.input}
          accessibilityLabel="Runs to buy"
        />
        <Row
          label="Total"
          value={formatToken(extraRunsCost(Number.isNaN(runs) ? 0 : runs), 'USDT')}
          valueColor={colors.gold}
          emphasis
        />
        {count.length > 0 && check.reason ? (
          <Text variant="caption" color={colors.danger}>
            {check.reason}
          </Text>
        ) : null}

        <Button
          label="Buy runs"
          size="lg"
          loading={buying}
          disabled={!check.ok}
          onPress={() => void buy()}
        />
      </Card>

      <Card style={styles.card} tone="premium">
        <View style={styles.rowBetween}>
          <Text variant="heading">Membership</Text>
          <Pill
            label={active ? 'Active' : membership.status === 'expired' ? 'Expired' : 'None'}
            color={active ? colors.green : colors.warning}
            dot
          />
        </View>
        <Row
          label="Active until"
          value={membership.activeUntil ? formatDate(membership.activeUntil) : '—'}
          valueColor={active ? colors.ink : colors.warning}
        />
        {active ? (
          <Row label="Renews in" value={countdown(membershipRemainingMs(entitlement))} />
        ) : null}
        <Row label="Runs per renewal" value={membership.runsPerRenewal.toString()} />
        <Row label="Price" value={formatToken(membership.priceUsdt, 'USDT')} />
        <Text variant="caption" color={colors.ink2}>
          Renewing adds {membership.runsPerRenewal} run credits. Letting it lapse stops the monthly
          top-up; it does not take back credits you already hold.
        </Text>
        <Button
          label={`Renew · ${formatToken(membership.priceUsdt, 'USDT')}`}
          variant="premium"
          size="lg"
          loading={renewing}
          onPress={() => void renew()}
        />
      </Card>

      <Card style={styles.card} tone="muted">
        <Text variant="caption" color={colors.ink3}>
          Prices and the monthly ceiling are enforced by the server — the copies in the app are for
          showing a total before you tap. Nothing is charged in this build: how USDT is collected
          follows the custody decision in the README, which is deliberately unmade.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingVertical: spacing.xl, alignItems: 'center', gap: spacing.xs },
  card: { gap: spacing.sm, marginBottom: spacing.lg },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  input: {
    ...type.body,
    color: colors.ink,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.lineNeutral,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
