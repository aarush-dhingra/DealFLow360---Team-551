'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ data: { accessToken: string; user: { id: string; email: string; displayName: string; roles: string[] } } }>(
        '/auth/login',
        { email }
      );
      setToken(res.data.accessToken, res.data.user);
      router.push('/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('Account creation is handled by your admin. Contact admin@dealflow360.local.');
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <Image src="/logo-256.png" alt="DealFlow360" width={72} height={72} className="rounded-xl" priority />
          </div>
          <h1 className="text-2xl font-bold text-indigo-600">DealFlow360</h1>
          <p className="mt-1 text-sm text-gray-500">Sales Operations Platform</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
            {(['login', 'signup'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); }}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${
                  tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
                }`}
              >
                {t === 'login' ? 'Log In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={tab === 'login' ? handleLogin : handleSignup} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-60"
            >
              {loading ? 'Signing in...' : tab === 'login' ? 'Log In' : 'Create Account'}
            </button>
            {tab === 'login' && (
              <button type="button" className="w-full text-sm text-gray-500 hover:text-gray-700 text-center">
                Forgot Password?
              </button>
            )}
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          After login, internal users land on the Sales Dashboard.
          <br />Customers land on their Quotation Portal.
        </p>
      </div>
    </div>
  );
}
