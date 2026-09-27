import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing } from '@/theme';
import { Button } from './Button';
import { Eyebrow } from './Eyebrow';
import { Row } from './Row';
import { Text } from './Text';

type Line = { label: string; value: string; color?: string };

type Props = {
  visible: boolean;
  title: string;
  /** "BEP-20 transfer", "Wallet signature". */
  eyebrow?: string;
  lines: readonly Line[];
  total?: Line;
  note?: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * The wallet signature sheet: what is about to be signed, in full, before it is. Every purchase
 * and transfer in the wireframes goes through one (run packs, seeds, checkout, send).
 */
export function ConfirmSheet({
  visible,
  title,
  eyebrow = 'Wallet signature',
  lines,
  total,
  note,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} onPress={busy ? undefined : onCancel} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.grip} />
        <Eyebrow label={eyebrow} />
        <Text variant="heading" style={styles.title}>
          {title}
        </Text>
        <View style={styles.lines}>
          {lines.map((l) => (
            <Row key={l.label} label={l.label} value={l.value} valueColor={l.color} />
          ))}
          {total ? (
            <View style={styles.total}>
              <Row label={total.label} value={total.value} valueColor={total.color} emphasis />
            </View>
          ) : null}
        </View>
        {note ? (
          <Text variant="caption" color={colors.inkFaint}>
            {note}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <Button label="Cancel" variant="secondary" onPress={onCancel} disabled={busy} style={styles.flex} />
          <Button label={confirmLabel} onPress={onConfirm} loading={busy} style={styles.flex} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)' },
  sheet: {
    backgroundColor: colors.raised,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    paddingHorizontal: spacing.gutter,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, marginBottom: spacing.sm },
  title: { marginTop: -4 },
  lines: { gap: 2 },
  total: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  actions: { flexDirection: 'row', gap: 10, marginTop: spacing.sm },
  flex: { flex: 1 },
});
