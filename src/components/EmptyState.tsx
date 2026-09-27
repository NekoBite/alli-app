import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { Button } from './Button';
import { IconTile } from './IconTile';
import { Text } from './Text';

type Props = {
  title: string;
  body: string;
  glyph?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function EmptyState({ title, body, glyph, actionLabel, onAction }: Props) {
  return (
    <View style={styles.root}>
      {glyph ? <IconTile glyph={glyph} size={56} /> : null}
      <Text variant="heading" center>
        {title}
      </Text>
      <Text variant="body" color={colors.inkDim} center>
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
