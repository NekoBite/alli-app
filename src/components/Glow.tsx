import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { colors } from '@/theme';

/** The warm radial glow in the top-left corner of every wireframe screen. */
export function Glow() {
  return (
    <View pointerEvents="none" style={styles.root}>
      <Svg width={560} height={440}>
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={colors.red} stopOpacity={0.22} />
            <Stop offset="1" stopColor={colors.red} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={280} cy={220} rx={280} ry={220} fill="url(#glow)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: -85, top: -230 },
});
