import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { useAuthStore } from '@/features/auth/store';

/**
 * alli.app/r/<code> — an invite link (6.7). The code is held through sign-in (1.1 shows it) and
 * attributed to its own program once the friend is signed in. Signed-in members land on Today.
 */
export default function InviteLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const setReferralCode = useAuthStore((s) => s.setReferralCode);
  const status = useAuthStore((s) => s.status);

  useEffect(() => {
    if (code) setReferralCode(code);
  }, [code, setReferralCode]);

  if (status === 'unknown') return null;
  return <Redirect href={status === 'signedIn' ? '/(tabs)' : '/sign-in'} />;
}
