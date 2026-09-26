import { StyleSheet, View } from 'react-native';

import { Meter, Text } from '@/components';
import { colors, spacing } from '@/theme';
import { countdown } from '@/utils/time';
import type { StatusView } from '../types';

/**
 * The three care meters with the line each must stay above. The line moves
 * with conditions and practices, which is why it is drawn rather than implied.
 */
export function StatusMeters({ meters, caption = true }: { meters: StatusView[]; caption?: boolean }) {
  const low = meters.filter((m) => !m.ok);
  const next = meters
    .filter((m) => m.ok && m.msUntilBelow > 0)
    .sort((a, b) => a.msUntilBelow - b.msUntilBelow)[0];
  return (
    <View style={styles.root}>
      {meters.map((meter) => (
        <Meter key={meter.id} label={meter.label} value={meter.level} threshold={meter.threshold} />
      ))}
      {caption ? (
        <Text variant="caption" color={low.length ? colors.warn : colors.inkFaint} style={styles.caption}>
          {low.length
            ? `${low.map((m) => m.label).join(' and ')} below the line — top up before tonight or the tree earns nothing.`
            : next
              ? `Keep every meter above the line — each night leaves stars on the branches. ${next.label} dips below in ${countdown(next.msUntilBelow)}.`
              : 'Keep every meter above the line — each night leaves stars on the branches.'}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 2 },
  caption: { marginTop: spacing.sm, fontSize: 12 },
});
