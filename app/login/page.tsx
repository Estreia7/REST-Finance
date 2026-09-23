'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  useEffect(() => {
    // Carries the "your session ended" flag through, so the sign-in form can
    // say why the owner is looking at it.
    const expired = new URLSearchParams(window.location.search).get('expired') === '1';
    router.replace(expired ? '/?auth=login&expired=1' : '/?auth=login');
  }, [router]);
  return null;
}
