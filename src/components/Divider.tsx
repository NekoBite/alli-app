import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { Text } from './Text';

/** Hairline, optionally split by a mono caption ("or continue with"). */
export function Divider({ label }: { label?: string }) {
  if (!label) return <View style={styles.line} />;
  return (
    <View style={styles.row}>
      <View style={[styles.line, styles.flex]} />
      <Text variant="mono" color={colors.inkFaint} style={styles.text}>
        {label}
      </Text>
      <View style={[styles.line, styles.flex]} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { height: 1, backgroundColor: colors.line },
  flex: { flex: 1 },
  text: { fontSize: 11 },
});
