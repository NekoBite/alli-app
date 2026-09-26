import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme';
import { Text } from './Text';

type Props = {
  label: string;
  color?: string;
};

/** The short rule + red mono caption that sits over every screen title. */
export function Eyebrow({ label, color = colors.redHot }: Props) {
  return (
    <View style={styles.root}>
      <View style={[styles.rule, { backgroundColor: color }]} />
      <Text variant="eyebrow" color={color} numberOfLines={1} style={styles.text}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  rule: { width: 16, height: 1 },
  text: { flexShrink: 1 },
});
