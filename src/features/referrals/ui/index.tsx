import { StyleSheet, View } from 'react-native';

import { Pill, Text } from '@/components';
import type { ShoeTier } from '@/features/run/shoes';
import { colors } from '@/theme';
import { formatRates, REFERRAL_RULES } from '../rules';
import type { ProgramStatus, ReferralProgramId } from '../types';

export const TIER_COLOR: Record<ShoeTier, string> = {
  leather: colors.inkFaint,
  silver: '#CFC7C3',
  gold: colors.warn,
};

export function TierBadge({ tier }: { tier: ShoeTier }) {
  return <Pill label={tier} color={TIER_COLOR[tier]} />;
}

export const STATUS_PILL: Record<ProgramStatus, { label: string; color: string }> = {
  earning: { label: 'Earning', color: colors.ok },
  locked: { label: 'Locked', color: colors.warn },
  comingSoon: { label: 'Coming soon', color: colors.warn },
};

/** Short program copy for cards, the share sheet and the per-feature banners. */
export const PROGRAM_COPY: Record<
  ReferralProgramId,
  { glyph: string; name: string; tagline: string; youGet: string; friendGets: string }
> = {
  run: {
    glyph: 'R',
    name: 'ALLI RUN',
    tagline: 'Earn when your team upgrades to Silver',
    youGet: '40% of their Silver upgrade',
    friendGets: 'Free wallet + Leather NFT shoe',
  },
  garden: {
    glyph: 'G',
    name: 'Garden',
    tagline: 'Earn when your team buys seeds',
    youGet: '20% of their seed purchases',
    friendGets: 'Free wallet + a place in your Garden team',
  },
  market: {
    glyph: 'M',
    name: 'Marketplace',
    tagline: 'Earn from fees on your team’s orders',
    youGet: '1% of every order they place',
    friendGets: 'Free wallet + 10% back in stars on ALLI orders',
  },
  card: {
    glyph: 'C',
    name: 'ALLI Card',
    tagline: 'Reserve your code · waitlist',
    youGet: 'Proposed: 5 USDT per activation',
    friendGets: 'A place on the card waitlist',
  },
};

export function ratesLabel(program: ReferralProgramId): string {
  return formatRates(REFERRAL_RULES[program].ratesBps);
}

/** The line every share surface carries (docs/referral-programs.md §4). */
export function Disclaimer() {
  return (
    <View style={styles.disclaimer}>
      <Text variant="caption" color={colors.inkFaint} center style={styles.small}>
        Commissions depend on your team’s purchases; there is no guaranteed income.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disclaimer: { marginTop: 14 },
  small: { fontSize: 12 },
});
