import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { gradient } from '@/theme';

type Props = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** The primary gradient (#E24522 → #FF6A3D), left to right, as on every filled CTA. */
export function Gradient({ children, style }: Props) {
  return (
    <LinearGradient
      colors={gradient.primary}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={style}
    >
      {children}
    </LinearGradient>
  );
}
