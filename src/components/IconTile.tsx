import { StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, fonts } from '@/theme';
import { Gradient } from './Gradient';
import { Text } from './Text';

type Props = {
  /** One glyph: a letter ("G", "A"), "+", "$", an arrow. */
  glyph: string;
  size?: number;
  /**
   * `solid` is the gradient tile with a dark glyph (invite "+", wallet actions);
   * `outline` the dark tile with a red glyph (list rows); `warn` the amber variant.
   */
  tone?: 'solid' | 'outline' | 'warn' | 'faint';
  style?: ViewStyle;
};

/** The letter tile the wireframes use in place of icons. */
export function IconTile({ glyph, size = 40, tone = 'outline', style }: Props) {
  const box = { width: size, height: size, borderRadius: size * 0.3 };
  const glyphStyle = { fontFamily: fonts.monoMedium, fontSize: size * 0.42, lineHeight: size * 0.55 };

  if (tone === 'solid') {
    return (
      <Gradient style={[styles.center, box, style]}>
        <Text style={glyphStyle} color={colors.onRed}>
          {glyph}
        </Text>
      </Gradient>
    );
  }
  const color = tone === 'warn' ? colors.warn : tone === 'faint' ? colors.inkFaint : colors.redHot;
  return (
    <View
      style={[
        styles.center,
        styles.outline,
        box,
        tone === 'warn' && { borderColor: 'rgba(232, 184, 75, 0.4)' },
        style,
      ]}
    >
      <Text style={glyphStyle} color={color}>
        {glyph}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  outline: {
    backgroundColor: 'rgba(226, 69, 34, 0.12)',
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
});
