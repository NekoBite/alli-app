import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { Button } from './Button';
import { Text } from './Text';

type Props = {
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, body, actionLabel, onAction }: Props) {
  return (
    <View style={styles.root}>
      <Text variant="heading" center>
        {title}
      </Text>
      <Text variant="body" color={colors.ink2} center>
        {body}
      </Text>
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
});
