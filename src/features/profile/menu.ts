import { router } from 'expo-router';
import { Alert } from 'react-native';

import { useAuthStore } from '@/features/auth/store';

/** Initials for the avatar: "Demo runner" → "DR", "alli@x.io" → "AL". */
export function initialsFor(user: { displayName: string | null; email: string | null } | undefined): string {
  const name = user?.displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
  }
  return (user?.email ?? 'AL').slice(0, 2).toUpperCase();
}

/** The avatar menu (2.1): referral hub, and sign out. */
export function openProfileMenu() {
  const { user, signOut } = useAuthStore.getState();
  Alert.alert(user?.displayName ?? user?.email ?? 'Your account', undefined, [
    { text: 'Invite & earn', onPress: () => router.push('/referrals') },
    { text: 'Sign out', style: 'destructive', onPress: () => void signOut() },
    { text: 'Cancel', style: 'cancel' },
  ]);
}
