import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/theme';
import { Text } from './Text';

type Props = {
  label: string;
  color?: string;
  /** Adds a filled dot before the label — useful for status. */
  dot?: boolean;
};

export function Pill({ label, color = colors.green, dot }: Props) {
  return (
    <View style={[styles.root, { borderColor: color }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text variant="label" color={color}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
