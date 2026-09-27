import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, radius } from '@/theme';
import { Text } from './Text';

type Option<T extends string> = { value: T; label: string; disabled?: boolean };

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: ViewStyle;
};

/** Two- or three-way toggle: ALLI / USDT, List / Chart, Run / Garden / Market. */
export function Segmented<T extends string>({ options, value, onChange, style }: Props<T>) {
  return (
    <View style={[styles.root, style]} accessibilityRole="tablist">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active, disabled: !!opt.disabled }}
            disabled={opt.disabled}
            onPress={() => onChange(opt.value)}
            style={[styles.option, active && styles.active, opt.disabled && styles.disabled]}
          >
            <Text
              variant="bodyStrong"
              color={active ? colors.redHot : colors.ink}
              style={styles.label}
              numberOfLines={1}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.raised,
  },
  option: {
    flex: 1,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: 8,
  },
  active: { backgroundColor: 'rgba(226, 69, 34, 0.18)', borderColor: colors.lineStrong },
  disabled: { opacity: 0.4 },
  label: { fontSize: 13 },
});
