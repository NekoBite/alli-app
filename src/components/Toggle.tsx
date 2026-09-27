import { Pressable, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

type Props = {
  value: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
};

/** On/off switch drawn to match the wireframes (Freeze card). */
export function Toggle({ value, onChange, label, disabled }: Props) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={[styles.track, value && styles.trackOn, disabled && { opacity: 0.4 }]}
    >
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 46,
    height: 26,
    borderRadius: 13,
    padding: 3,
    backgroundColor: colors.raised2,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  trackOn: { backgroundColor: colors.red, borderColor: colors.redHot },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: colors.inkDim },
  knobOn: { transform: [{ translateX: 20 }], backgroundColor: colors.ink },
});
