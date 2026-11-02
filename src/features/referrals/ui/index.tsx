import { StyleSheet, View } from 'react-native';

import { Pill, Text } from '@/components';
import type { ShoeTier } from '@/features/run/shoes';
import { colors } from '@/theme';
import { formatRates, triggerText, youGetText, type ReferralRates } from '../rules';
import { useReferralStore } from '../store';
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
  { glyph: string; name: string; tagline: string; friendGets: string }
> = {
  run: {
    glyph: 'R',
    name: 'ALLI RUN',
    tagline: 'Earn when your team upgrades to Silver',
    friendGets: 'Free wallet + Leather NFT shoe',
  },
  garden: {
    glyph: 'G',
    name: 'Garden',
    tagline: 'Earn when your team buys seeds',
    friendGets: 'Free wallet + a place in your Garden team',
  },
  market: {
    glyph: 'M',
    name: 'Marketplace',
    tagline: 'Earn from fees on your team’s orders',
    friendGets: 'Free wallet + 10% back in stars on ALLI orders',
  },
  card: {
    glyph: 'C',
    name: 'ALLI Card',
    tagline: 'Reserve your code · waitlist',
    friendGets: 'A place on the card waitlist',
  },
};

/**
 * The commission rates in force, and the text built from them. The numbers are never typed into
 * screen copy: they come from the server's rate table, so a rate the client changes changes here.
 */
export function useRates(): ReferralRates {
  return useReferralStore((s) => s.rates);
}

export const ratesLabel = (rates: ReferralRates, program: ReferralProgramId): string => formatRates(rates[program]);
export const youGet = (rates: ReferralRates, program: ReferralProgramId): string => youGetText(program, rates[program]);
export const triggerOf = (rates: ReferralRates, program: ReferralProgramId): string => triggerText(program, rates[program]);

/** "20% of their Silver upgrade" for a banner. */
export function useYouGet(program: ReferralProgramId): string {
  return youGet(useRates(), program);
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
