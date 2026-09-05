'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/api';

export function useRoleGuard(allowedRoles: string[]) {
  const router = useRouter();

  useEffect(() => {
    const user = getUser();
    if (!user) return;
    const hasRole = user.roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) router.replace('/dashboard');
  }, [router, allowedRoles.join(',')]);
}
