import { Text as RNText, type TextProps } from 'react-native';

import { colors, type as typeScale } from '@/theme';

type Variant = keyof typeof typeScale;

type Props = TextProps & {
  variant?: Variant;
  color?: string;
  center?: boolean;
};

/** Text bound to the type scale so screens never hand-roll font sizes. */
export function Text({ variant = 'body', color = colors.ink, center, style, ...rest }: Props) {
  return (
    <RNText
      {...rest}
      style={[typeScale[variant], { color }, center && { textAlign: 'center' }, style]}
    />
  );
}
