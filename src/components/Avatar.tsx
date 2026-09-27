import { Pressable, StyleSheet } from 'react-native';

import { colors } from '@/theme';
import { Gradient } from './Gradient';
import { Text } from './Text';

type Props = {
  initials: string;
  size?: number;
  onPress?: () => void;
};

export function Avatar({ initials, size = 38, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Profile"
      onPress={onPress}
      disabled={!onPress}
      hitSlop={6}
    >
      <Gradient style={[styles.root, { width: size, height: size, borderRadius: size / 2 }]}>
        <Text variant="bodyStrong" color={colors.ink} style={{ fontSize: size * 0.34 }}>
          {initials}
        </Text>
      </Gradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
});
