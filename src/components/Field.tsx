import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, fonts, radius, spacing } from '@/theme';
import { Text } from './Text';

type Props = TextInputProps & {
  label?: string;
  /** Right-hand slot inside the field (SCAN, ⌘K). */
  right?: React.ReactNode;
  error?: string | null;
  mono?: boolean;
};

/** Labelled input: mono label above a dark field whose border lights up on focus. */
export function Field({ label, right, error, mono, style, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.root}>
      {label ? (
        <Text variant="label" color={colors.inkFaint}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.box,
          focused && styles.focused,
          !!error && styles.error,
        ]}
      >
        <TextInput
          placeholderTextColor={colors.inkFaint}
          selectionColor={colors.redHot}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, mono && styles.mono, style]}
        />
        {right}
      </View>
      {error ? (
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 49,
    paddingHorizontal: 17,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.raised2,
  },
  focused: { borderColor: colors.redHot },
  error: { borderColor: colors.danger },
  input: {
    flex: 1,
    color: colors.ink,
    fontFamily: fonts.body,
    fontSize: 16,
    paddingVertical: 12,
  },
  mono: { fontFamily: fonts.mono, fontSize: 14 },
});
