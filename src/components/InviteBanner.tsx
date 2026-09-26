import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';
import { Card } from './Card';
import { IconTile } from './IconTile';
import { Text } from './Text';

type Props = {
  title: string;
  subtitle: string;
  href: Href;
};

/** The red "Invite & earn" strip at the top of every feature tab. */
export function InviteBanner({ title, subtitle, href }: Props) {
  return (
    <Card tone="accent" onPress={() => router.push(href)} style={styles.root} accessibilityLabel={title}>
      <IconTile glyph="+" size={34} tone="solid" />
      <View style={styles.stack}>
        <Text variant="bodyStrong" style={styles.title}>
          {title}
        </Text>
        <Text variant="caption" color={colors.inkDim} style={styles.sub} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <Text variant="bodyStrong" color={colors.redHot}>
        →
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 13,
    paddingHorizontal: 15,
    borderRadius: 14,
  },
  stack: { flex: 1, gap: 2 },
  title: { fontSize: 14 },
  sub: { fontSize: 12 },
});
