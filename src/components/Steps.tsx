import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { Gradient } from './Gradient';
import { Text } from './Text';

export type StepItem = {
  title: string;
  detail?: string;
  /** Right-aligned mono note ("09:41", "today"). */
  note?: string;
};

type Props = {
  steps: readonly StepItem[];
  /** Index of the step in progress; everything before it is done. */
  current: number;
};

/**
 * Numbered-circle stepper (order tracking, card pairing): done steps get a filled check, the
 * current one a red ring and red title, the rest stay faint.
 */
export function Steps({ steps, current }: Props) {
  return (
    <View style={styles.root}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <View key={step.title} style={styles.row}>
            {done ? (
              <Gradient style={styles.circle}>
                <Text variant="bodyStrong" color={colors.ink} style={styles.num}>
                  ✓
                </Text>
              </Gradient>
            ) : (
              <View style={[styles.circle, styles.ring, active && styles.ringActive]}>
                <Text variant="mono" color={active ? colors.redHot : colors.inkFaint}>
                  {i + 1}
                </Text>
              </View>
            )}
            <View style={styles.stack}>
              <Text
                variant="bodyStrong"
                color={active ? colors.redHot : done ? colors.ink : colors.inkDim}
                style={styles.title}
              >
                {step.title}
              </Text>
              {step.detail ? (
                <Text variant="caption" color={colors.inkFaint} style={styles.detail}>
                  {step.detail}
                </Text>
              ) : null}
            </View>
            {step.note ? (
              <Text variant="mono" color={colors.inkFaint} style={styles.note}>
                {step.note}
              </Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  circle: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ring: { borderWidth: 1, borderColor: colors.lineStrong },
  ringActive: { borderColor: colors.redHot },
  num: { fontSize: 13 },
  stack: { flex: 1, gap: 1 },
  title: { fontSize: 14 },
  detail: { fontSize: 12 },
  note: { fontSize: 10 },
});
