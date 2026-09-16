import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { Text } from './Text';

type Props = {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  /** `metric` for live-updating numbers, `title` for static summary figures. */
  size?: 'metric' | 'title';
};

export function StatTile({ label, value, unit, color = colors.ink, size = 'title' }: Props) {
  return (
    <View style={styles.root}>
      <Text variant="label" color={colors.ink2}>
        {label}
      </Text>
      <View style={styles.row}>
        <Text variant={size} color={color}>
          {value}
        </Text>
        {unit ? (
          <Text variant="caption" color={colors.ink2} style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  unit: { marginBottom: 2 },
});
