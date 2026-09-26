import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card, EmptyState, IconTile, Pill, Screen, ScreenHeader, StatTile, Text } from '@/components';
import { PROGRAM_ORDER } from '@/features/referrals/rules';
import { useReferralStore } from '@/features/referrals/store';
import type { ProgramSummary } from '@/features/referrals/types';
import { PROGRAM_COPY, ratesLabel, STATUS_PILL } from '@/features/referrals/ui';
import { colors, fonts, spacing } from '@/theme';
import { formatMoney, formatToken } from '@/utils/format';

/** 6.1 Referral hub — every program, each with its own link, team, trigger and rates. */
export default function ReferralHubScreen() {
  const router = useRouter();
  const { hub, refreshHub, loading, error } = useReferralStore();

  useEffect(() => {
    void refreshHub();
  }, [refreshHub]);

  const byId = new Map(hub?.programs.map((p) => [p.program, p]));

  return (
    <Screen onRefresh={() => void refreshHub()} refreshing={loading}>
      <ScreenHeader eyebrow="Referral programs" title="Invite & earn" back />

      {!hub ? (
        <EmptyState
          title={error ? 'Could not load your programs' : 'Loading'}
          body={error ?? 'One link and one team per feature.'}
          actionLabel={error ? 'Retry' : undefined}
          onAction={error ? () => void refreshHub() : undefined}
        />
      ) : (
        <>
          <Card tone="hero" style={styles.hero}>
            <Text variant="label" color={colors.inkFaint}>
              Earned across all programs
            </Text>
            <Text style={styles.big}>{formatMoney(hub.totalEarnedUsdt)} USDT</Text>
            <View style={styles.stats}>
              <StatTile label="Paid out" value={formatMoney(hub.paidOutUsdt)} sub="USDT" />
              <StatTile label="Rolled up to you" value={formatMoney(hub.rolledUpUsdt)} sub="USDT" />
            </View>
          </Card>

          <Text variant="caption" color={colors.inkDim} style={styles.intro}>
            Every feature has its own referral program: its own link, team, trigger and rates.
          </Text>

          <View style={styles.list}>
            {PROGRAM_ORDER.map((id) => {
              const p = byId.get(id);
              return p ? (
                <ProgramCard key={id} p={p} onPress={() => router.push({ pathname: '/referrals/[program]', params: { program: id } })} />
              ) : null;
            })}
          </View>
          <Text variant="caption" color={colors.inkFaint} style={styles.intro}>
            Garden, Market and Card rates are proposals and may change before launch.
          </Text>
        </>
      )}
    </Screen>
  );
}

function ProgramCard({ p, onPress }: { p: ProgramSummary; onPress: () => void }) {
  const copy = PROGRAM_COPY[p.program];
  const status = STATUS_PILL[p.status];
  const earned =
    p.earned.usdt || !p.earned.alli ? formatMoney(p.earned.usdt) : `${formatToken(p.earned.alli)} ALLI`;
  return (
    <Card onPress={onPress} style={styles.program} accessibilityLabel={`${copy.name} referral program`}>
      <View style={styles.head}>
        <IconTile glyph={copy.glyph} size={40} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" style={styles.name}>
            {copy.name}
          </Text>
          <Text variant="caption" color={colors.inkDim}>
            {copy.tagline}
          </Text>
        </View>
        <Text variant="bodyStrong" color={colors.inkDim}>
          →
        </Text>
      </View>
      {p.status === 'comingSoon' ? null : (
        <View style={styles.stats}>
          <StatTile kind="bare" label="Earned" value={earned} color={colors.ok} />
          <StatTile kind="bare" label="Team" value={String(p.teamSize)} />
          <StatTile kind="bare" label="Rate" value={ratesLabel(p.program).replace(/ \/ /g, '/')} color={colors.redHot} />
        </View>
      )}
      <Pill label={status.label} color={status.color} />
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { gap: spacing.md },
  big: { fontFamily: fonts.display, fontSize: 34, lineHeight: 42, color: colors.ink, letterSpacing: -0.6 },
  stats: { flexDirection: 'row', gap: spacing.sm },
  intro: { marginVertical: 14 },
  list: { gap: spacing.md },
  program: { gap: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { fontSize: 16 },
});
