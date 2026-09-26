import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { IconTile } from './IconTile';
import { Text } from './Text';

type Props = {
  glyph?: string;
  glyphTone?: 'solid' | 'outline' | 'warn' | 'faint';
  /** A custom leading element instead of the glyph tile. */
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  /** Right figure (display font) and the mono caption under it. */
  value?: string;
  valueSub?: string;
  valueColor?: string;
  /** Replaces value/valueSub. */
  right?: ReactNode;
  /** Draws the → chevron. Implied by onPress unless `chevron={false}`. */
  chevron?: boolean;
  onPress?: () => void;
  disabled?: boolean;
};

/** Icon tile + title/subtitle + a figure on the right: tokens, seeds, minigames, team members. */
export function ListRow({
  glyph,
  glyphTone = 'outline',
  leading,
  title,
  subtitle,
  value,
  valueSub,
  valueColor = colors.ink,
  right,
  chevron,
  onPress,
  disabled,
}: Props) {
  const showChevron = chevron ?? !!onPress;
  const body = (
    <>
      {leading ?? (glyph ? <IconTile glyph={glyph} size={40} tone={glyphTone} /> : null)}
      <View style={styles.stack}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color={colors.inkDim} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ??
        (value !== undefined ? (
          <View style={styles.value}>
            <Text variant="figure" color={valueColor} style={styles.figure}>
              {value}
            </Text>
            {valueSub ? (
              <Text variant="mono" color={colors.inkFaint} style={styles.sub}>
                {valueSub}
              </Text>
            ) : null}
          </View>
        ) : null)}
      {showChevron ? (
        <Text variant="bodyStrong" color={colors.inkDim}>
          →
        </Text>
      ) : null}
    </>
  );

  if (!onPress) return <View style={[styles.row, disabled && styles.disabled]}>{body}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10 },
  stack: { flex: 1, gap: 2 },
  value: { alignItems: 'flex-end', gap: 2 },
  figure: { fontSize: 15, lineHeight: 19 },
  sub: { fontSize: 11 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
});
