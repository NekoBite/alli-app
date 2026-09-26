import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Card, IconTile, Logo, Row, Screen, ScreenHeader, Segmented, Text, toast } from '@/components';
import { PROGRAM_ORDER } from '@/features/referrals/rules';
import { useReferralStore } from '@/features/referrals/store';
import type { ReferralProgramId } from '@/features/referrals/types';
import { Disclaimer, PROGRAM_COPY } from '@/features/referrals/ui';
import { colors, fonts, radius, spacing } from '@/theme';

const LABEL: Record<ReferralProgramId, string> = { run: 'Run', garden: 'Garden', market: 'Market', card: 'Card' };

/** 6.7 Share invite — the program switcher changes the code, QR, link and reward lines. */
export default function ShareInviteScreen() {
  const params = useLocalSearchParams<{ program?: string }>();
  const { hub, refreshHub } = useReferralStore();
  const [program, setProgram] = useState<ReferralProgramId>(
    PROGRAM_ORDER.find((p) => p === params.program) ?? 'run',
  );

  useEffect(() => {
    if (!hub) void refreshHub();
  }, [hub, refreshHub]);

  const summary = hub?.programs.find((p) => p.program === program);
  const url = summary ? `https://${summary.link}` : '';
  const copy = PROGRAM_COPY[program];
  const message = `Join me on ALLI — ${copy.friendGets.toLowerCase()}. ${url}`;

  const targets: { glyph: string; label: string; go: () => void }[] = [
    { glyph: 'L', label: 'LINE', go: () => void Linking.openURL(`https://line.me/R/share?text=${encodeURIComponent(message)}`) },
    { glyph: 'F', label: 'Facebook', go: () => void Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`) },
    { glyph: 'X', label: 'X', go: () => void Linking.openURL(`https://x.com/intent/post?text=${encodeURIComponent(message)}`) },
    {
      glyph: 'C',
      label: 'Copy',
      go: () =>
        void Clipboard.setStringAsync(url).then(() => toast('Invite link copied', 'ok')),
    },
  ];

  return (
    <Screen>
      <ScreenHeader eyebrow="Pick a program" title="Invite friends" back />

      <Segmented options={PROGRAM_ORDER.map((p) => ({ value: p, label: LABEL[p] }))} value={program} onChange={setProgram} />

      <View style={styles.qrWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share invite"
          onPress={() => void Share.share({ message }).catch(() => undefined)}
          style={styles.qr}
        >
          {url ? <QRCode value={url} size={176} color={colors.ink} backgroundColor={colors.raised} ecl="H" /> : <View style={styles.qrEmpty} />}
          <View style={styles.qrLogo}>
            <Logo size={36} />
          </View>
        </Pressable>
        <Text style={styles.code}>{summary?.code ?? '…'}</Text>
        <Text variant="mono" color={colors.inkFaint}>
          {summary?.link ?? ''}
        </Text>
      </View>

      <View style={styles.targets}>
        {targets.map((t) => (
          <Pressable key={t.label} accessibilityRole="button" accessibilityLabel={`Share on ${t.label}`} disabled={!url} onPress={t.go} style={styles.target}>
            <IconTile glyph={t.glyph} size={34} />
            <Text variant="bodyStrong" style={styles.targetLabel}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Card style={styles.lines}>
        <Row label="Your friend gets" value={copy.friendGets} />
        <Row label="You get" value={copy.youGet} valueColor={colors.redHot} />
      </Card>
      <Text variant="caption" color={colors.inkFaint} style={styles.note}>
        Opening the link takes your friend to sign-in with this code filled in. Joining adds them to
        your {LABEL[program]} team only.
      </Text>
      <Disclaimer />
    </Screen>
  );
}

const styles = StyleSheet.create({
  qrWrap: { alignItems: 'center', gap: 6, marginVertical: spacing.xl },
  qr: {
    padding: 18,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.raised,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  qrEmpty: { width: 176, height: 176 },
  qrLogo: { position: 'absolute', padding: 4, borderRadius: 12, backgroundColor: colors.raised },
  code: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.ink },
  targets: { flexDirection: 'row', gap: spacing.sm },
  target: {
    flex: 1,
    gap: 10,
    padding: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
  },
  targetLabel: { fontSize: 12 },
  lines: { marginTop: 14, gap: 2 },
  note: { marginTop: spacing.md },
});
