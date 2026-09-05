'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearToken, getUser, setToken } from '@/lib/api';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirmPassword) return setError('Passwords do not match.');
    setLoading(true); setError('');
    try {
      await api.post('/auth/change-password', { newPassword: password });
      const current = getUser();
      if (!current) throw new Error('Your session has expired. Please sign in again.');
      setToken(current ? (localStorage.getItem('df360_token') ?? '') : '', { ...current, mustChangePassword: false });
      router.replace(current.roles.includes('customer_portal') ? '/portal' : '/dashboard');
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Could not update password.'); }
    finally { setLoading(false); }
  }

  return <main className="min-h-screen bg-brand-50 flex items-center justify-center px-4"><form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
    <div><h1 className="text-xl font-bold text-gray-900">Choose a new password</h1><p className="mt-1 text-sm text-gray-500">Your temporary password can only be used to sign in once.</p></div>
    {error && <p className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</p>}
    <label className="block text-sm text-gray-700">New password<input type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300" /></label>
    <label className="block text-sm text-gray-700">Confirm new password<input type="password" minLength={8} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300" /></label>
    <button disabled={loading} className="w-full bg-brand text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-60">{loading ? 'Updating…' : 'Save password'}</button>
    <button type="button" onClick={() => { clearToken(); router.replace('/'); }} className="w-full text-sm text-gray-500">Sign out</button>
  </form></main>;
}
