import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  Pill,
  ProgressBar,
  Screen,
  ScreenHeader,
  SectionHeader,
  StatTile,
  Text,
  toast,
} from '@/components';
import { REFERRAL_RULES } from '@/features/referrals/rules';
import { useReferralStore } from '@/features/referrals/store';
import type { ProgramDetail, ReferralProgramId } from '@/features/referrals/types';
import { Disclaimer, PROGRAM_COPY, ratesLabel } from '@/features/referrals/ui';
import { colors, fonts, radius, spacing } from '@/theme';
import { formatMoney, formatToken } from '@/utils/format';

const isProgram = (v: string | undefined): v is ReferralProgramId =>
  v === 'run' || v === 'garden' || v === 'market' || v === 'card';

/** 6.2–6.5 Program detail — earned, team, trigger, qualification, roll-up, invite link. */
export default function ProgramScreen() {
  const router = useRouter();
  const { program } = useLocalSearchParams<{ program: string }>();
  const detail = useReferralStore((s) => (isProgram(program) ? s.details[program] : undefined));
  const loadProgram = useReferralStore((s) => s.loadProgram);
  const error = useReferralStore((s) => s.error);

  useEffect(() => {
    if (isProgram(program)) void loadProgram(program);
  }, [program, loadProgram]);

  if (!isProgram(program)) {
    return (
      <Screen>
        <ScreenHeader title="Referral" back />
        <EmptyState title="No such program" body="Pick a program from the referral hub." />
      </Screen>
    );
  }

  const copy = PROGRAM_COPY[program];
  const rules = REFERRAL_RULES[program];
  const share = () => router.push({ pathname: '/referrals/share', params: { program } });

  if (!detail) {
    return (
      <Screen>
        <ScreenHeader eyebrow={`Program · ${rules.title}`} title={`${copy.name} referral`} back />
        <EmptyState title={error ? 'Could not load' : 'Loading'} body={error ?? rules.trigger} />
      </Screen>
    );
  }

  return detail.status === 'comingSoon' ? (
    <Waitlist detail={detail} onShare={share} />
  ) : (
    <Live detail={detail} onShare={share} onTree={() => router.push({ pathname: '/referrals/[program]/tree', params: { program } })} />
  );
}

function Live({ detail, onShare, onTree }: { detail: ProgramDetail; onShare: () => void; onTree: () => void }) {
  const copy = PROGRAM_COPY[detail.program];
  const rules = REFERRAL_RULES[detail.program];
  const gens = detail.teamByGeneration.length;
  const deeper = gens > 1 ? `Gen 2–${gens}` : '';
  const copyLink = async () => {
    await Clipboard.setStringAsync(`https://${detail.link}`);
    toast('Invite link copied', 'ok');
  };
  const rolledUp = detail.rolledUp.usdt || detail.rolledUp.alli;

  return (
    <Screen footer={<Button label="Share invite" onPress={onShare} />}>
      <ScreenHeader eyebrow={`Program · ${rules.title}`} title={`${copy.name} referral`} back />

      <Card tone="hero" style={styles.gap}>
        <Text variant="label" color={colors.inkFaint}>
          Total earned · this program
        </Text>
        <Text style={styles.big}>{formatMoney(detail.earned.usdt)} USDT</Text>
        <Text variant="mono" color={colors.inkFaint}>
          {detail.earned.alli ? `+ ${formatToken(detail.earned.alli)} ALLI from ALLI-seed purchases · ` : ''}
          Paid to your wallet
        </Text>
      </Card>

      <View style={styles.stats}>
        <StatTile label="Team size" value={String(detail.teamSize)} sub={`Gen 1–${gens}`} />
        <StatTile label="Commission" value={ratesLabel(detail.program)} color={colors.redHot} sub={deeper ? `Gen 1 / ${deeper}` : 'Gen 1'} />
      </View>

      <Card style={[styles.gap, styles.block]}>
        <Text variant="caption" color={colors.inkDim}>
          <Text variant="bodyStrong" color={colors.redHot}>
            ϟ{' '}
          </Text>
          {rules.trigger}
        </Text>
      </Card>

      <Card style={[styles.gap, styles.block]}>
        <Text variant="label" color={colors.inkFaint}>
          To qualify
        </Text>
        {detail.qualification.map((q) => (
          <View key={q.label} style={styles.check}>
            <View style={[styles.tick, { borderColor: q.met ? colors.ok : q.soft ? colors.warn : colors.danger }]}>
              <Text variant="mono" color={q.met ? colors.ok : q.soft ? colors.warn : colors.danger}>
                {q.met ? '✓' : '!'}
              </Text>
            </View>
            <Text variant="caption" color={q.met ? colors.ink : colors.warn} style={styles.flex}>
              {q.label}
              {q.detail ? ` · ${q.detail}` : ''}
            </Text>
          </View>
        ))}
        {detail.status === 'locked' ? (
          <Text variant="caption" color={colors.warn}>
            Locked: shares that would reach you go to the next qualified member above until you
            qualify again.
          </Text>
        ) : null}
      </Card>

      <Card style={[styles.gap, styles.block]}>
        <View style={styles.rowBetween}>
          <Text variant="label" color={colors.redHot}>
            Roll-up
          </Text>
          <Text variant="figure" color={colors.ok} style={styles.fig}>
            +{formatMoney(rolledUp)} {detail.rolledUp.usdt ? 'USDT' : 'ALLI'}
          </Text>
        </View>
        <Text variant="caption" color={colors.inkDim}>
          If someone between you and the buyer isn’t qualified, their share rolls up to the next
          qualified member above — that can be you.
        </Text>
        <Text variant="caption" color={colors.inkFaint}>
          If the buyer’s direct sponsor (Gen 1) isn’t qualified, that share goes to the ALLI
          treasury for project revenue or supply burn.
        </Text>
      </Card>

      {detail.milestone ? (
        <Card style={[styles.gap, styles.block]}>
          <View style={styles.rowBetween}>
            <Text variant="label" color={colors.inkFaint}>
              {detail.milestone.label}
            </Text>
            <Text variant="mono" color={colors.redHot}>
              {detail.milestone.progress} / {detail.milestone.goal}
            </Text>
          </View>
          <ProgressBar progress={detail.milestone.progress / detail.milestone.goal} />
          <Text variant="caption" color={colors.inkDim}>
            {detail.milestone.detail}
          </Text>
        </Card>
      ) : null}

      <Card style={[styles.gap, styles.block]}>
        <Text variant="label" color={colors.inkFaint}>
          Your {rules.title} invite link
        </Text>
        <View style={styles.rowBetween}>
          <Text style={styles.link} numberOfLines={1}>
            {detail.link}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Copy invite link" onPress={() => void copyLink()} hitSlop={8}>
            <Pill label="Copy" color={colors.inkDim} />
          </Pressable>
        </View>
      </Card>

      <View style={styles.block}>
        <SectionHeader title="Team by generation" actionLabel="Open tree" onAction={onTree} />
        <View style={styles.gens}>
          {detail.teamByGeneration.map((n, i) => (
            <View key={i} style={styles.gen}>
              <Text variant="figure">{n}</Text>
              <Text variant="mono" color={colors.inkFaint}>
                Gen {i + 1}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <Disclaimer />
    </Screen>
  );
}

function Waitlist({ detail, onShare }: { detail: ProgramDetail; onShare: () => void }) {
  const rules = REFERRAL_RULES[detail.program];
  return (
    <Screen footer={<Button label="Share waitlist link" onPress={onShare} />}>
      <ScreenHeader
        eyebrow={`Program · ${rules.title}`}
        title={`${PROGRAM_COPY[detail.program].name} referral`}
        back
        right={<Pill label="Coming soon" color={colors.warn} />}
      />
      <Card tone="hero" style={styles.gap}>
        <Text variant="label" color={colors.redHot}>
          Reserve your code now
        </Text>
        <Text style={styles.code}>{detail.code}</Text>
        <Text variant="caption" color={colors.inkDim}>
          Friends who join the waitlist with your code are saved to your Card team and count once
          cards launch.
        </Text>
      </Card>
      <View style={styles.stats}>
        <StatTile label="On waitlist" value={String(detail.waitlist?.friends ?? 0)} sub="friends" />
        <StatTile label="Your spot" value={`#${(detail.waitlist?.queuePosition ?? 0).toLocaleString('en-US')}`} sub="in the queue" />
      </View>
      <Card style={styles.block}>
        <Text variant="caption" color={colors.inkDim}>
          <Text variant="bodyStrong" color={colors.redHot}>
            ϟ{' '}
          </Text>
          {rules.trigger}
        </Text>
      </Card>
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { gap: spacing.md },
  block: { marginTop: 14 },
  big: { fontFamily: fonts.display, fontSize: 34, lineHeight: 42, color: colors.ink, letterSpacing: -0.6 },
  code: { fontFamily: fonts.display, fontSize: 30, lineHeight: 38, color: colors.ink },
  stats: { flexDirection: 'row', gap: spacing.sm, marginTop: 14 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  fig: { fontSize: 15 },
  check: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tick: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  link: { flex: 1, fontFamily: fonts.monoMedium, fontSize: 14, color: colors.ink },
  gens: { flexDirection: 'row', gap: spacing.sm },
  gen: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
  },
});
