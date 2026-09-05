'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getUser } from '@/lib/api';

export function useRoleGuard(allowedRoles: string[]) {
  const router = useRouter();

  useEffect(() => {
    const user = getUser();
    if (!user) return;
    const raw = (user as Record<string, unknown>).roles ?? (user as Record<string, unknown>).role;
    if (!raw) return; // no roles stored yet — don't redirect
    const roles: string[] = Array.isArray(raw) ? raw as string[] : [String(raw)];
    const hasRole = roles.some((r) => allowedRoles.includes(r));
    if (!hasRole) router.replace('/dashboard');
  }, [router, allowedRoles.join(',')]);
}
