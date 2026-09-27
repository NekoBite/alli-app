import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

/** The ALLI mark: a white "A" on the red rounded square. Paths come from the wireframe file. */
export function Logo({ size = 56 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56" accessibilityLabel="ALLI">
      <Path
        d="M42 0H14C6.27 0 0 6.27 0 14v28c0 7.73 6.27 14 14 14h28c7.73 0 14-6.27 14-14V14C56 6.27 49.73 0 42 0Z"
        fill={colors.red}
      />
      <Path d="M28 7.88 47.25 45.94H37.19L28 21.88 18.81 45.94H8.75L28 7.88Z" fill="#FFFFFF" />
      <Path d="M28 29.31 33.6 45.94H22.4L28 29.31Z" fill="#FFFFFF" />
    </Svg>
  );
}
