import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { Text } from './Text';

type Props = {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  /** Line under the value ("Gen 1–4", "+12 vs yesterday"). */
  sub?: string;
  /** `tile` is the bordered box of a stat row; `bare` drops the box (inside a hero card). */
  kind?: 'tile' | 'bare';
  style?: ViewStyle;
};

export function StatTile({ label, value, unit, color = colors.ink, sub, kind = 'tile', style }: Props) {
  return (
    <View style={[styles.root, kind === 'tile' && styles.tile, style]}>
      <Text variant="label" color={colors.inkFaint}>
        {label}
      </Text>
      <View style={styles.row}>
        <Text variant="figure" color={color} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {unit ? (
          <Text variant="mono" color={colors.inkFaint}>
            {unit}
          </Text>
        ) : null}
      </View>
      {sub ? (
        <Text variant="mono" color={colors.inkFaint} style={styles.sub}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6, flex: 1 },
  tile: {
    backgroundColor: colors.raised2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: 14,
  },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
  sub: { fontSize: 11 },
});
