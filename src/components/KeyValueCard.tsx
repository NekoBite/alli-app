import { StyleSheet, View } from 'react-native';

import { spacing } from '@/theme';
import { Card } from './Card';
import { Row } from './Row';
import { Text } from './Text';

type Line = { label: string; value: string; color?: string };

type Props = {
  title?: string;
  lines: readonly Line[];
  /** Emphasised last line ("Total", "You pay"), drawn under a hairline. */
  total?: Line;
};

/** A card of label / mono-value rows: breakdowns, fees, receipts. */
export function KeyValueCard({ title, lines, total }: Props) {
  return (
    <Card>
      {title ? (
        <Text variant="figure" style={styles.title}>
          {title}
        </Text>
      ) : null}
      {lines.map((l) => (
        <Row key={l.label} label={l.label} value={l.value} valueColor={l.color} />
      ))}
      {total ? (
        <View style={styles.total}>
          <Row label={total.label} value={total.value} valueColor={total.color} emphasis />
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, marginBottom: spacing.sm },
  total: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226, 69, 34, 0.16)',
  },
});
