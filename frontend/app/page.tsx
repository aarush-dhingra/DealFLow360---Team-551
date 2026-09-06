'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<'login' | 'customerSignup'>('login');
  const [step, setStep] = useState<'form' | 'forgot' | 'otp'>('form');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [passErr, setPassErr] = useState('');

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validateEmail(val: string) {
    if (!val) { setEmailErr(''); return true; }
    if (!EMAIL_RE.test(val)) { setEmailErr('Enter a valid email address (e.g. you@company.com)'); return false; }
    setEmailErr(''); return true;
  }
  function validatePassword(val: string) {
    if (!val) { setPassErr(''); return true; }
    const issues: string[] = [];
    if (val.length < 6) issues.push('at least 6 characters');
    if (!/[A-Z]/.test(val)) issues.push('an uppercase letter');
    if (!/[a-z]/.test(val)) issues.push('a lowercase letter');
    if (!/[^A-Za-z0-9]/.test(val)) issues.push('a symbol (!@#$%...)');
    if (issues.length) { setPassErr('Password needs: ' + issues.join(', ')); return false; }
    setPassErr(''); return true;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!validateEmail(email) | !validatePassword(password)) return;
    setLoading(true); setError('');
    try {
      const res = await api.post<{ data: { accessToken: string; user: { id: string; email: string; displayName: string; roles: string[]; mustChangePassword: boolean } } }>(
        '/auth/login', { email, password }
      );
      setToken(res.data.accessToken, res.data.user);
      router.push(res.data.user.mustChangePassword ? '/change-password' : res.data.user.roles.includes('customer_portal') ? '/portal' : '/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally { setLoading(false); }
  }

  async function handleCustomerSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!validateEmail(email) | !validatePassword(password)) return;
    setLoading(true); setError('');
    try {
      const res = await api.post<{ data: { accessToken: string; user: { id: string; email: string; displayName: string; roles: string[]; mustChangePassword: boolean } } }>(
        '/auth/customer-signup', { email, password, displayName }
      );
      setToken(res.data.accessToken, res.data.user);
      router.push('/portal');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Account creation failed');
    } finally { setLoading(false); }
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.post('/auth/forgot-password', { email });
      setStep('otp');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally { setLoading(false); }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!validatePassword(newPassword)) return;
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      await api.post('/auth/reset-password', { token: otp, newPassword });
      setSuccess('Password reset! You can now log in.');
      setStep('form');
      setOtp(''); setNewPassword(''); setConfirmPassword('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally { setLoading(false); }
  }

  function goBack() { setStep('form'); setError(''); setSuccess(''); }

  return (
    <div className="min-h-screen bg-brand-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-3">
            <Image src="/logo-256.png" alt="DealFlow360" width={72} height={72} className="rounded-xl" priority />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">DealFlow<span className="text-brand">360</span></h1>
          <p className="mt-1 text-sm text-gray-500">Sales Operations Platform</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">

          {/* ── Forgot password: enter email ── */}
          {step === 'forgot' && (
            <>
              <button onClick={goBack} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4">← Back to login</button>
              <h2 className="text-base font-semibold text-gray-900 mb-1">Forgot password?</h2>
              <p className="text-xs text-gray-500 mb-4">Enter your email — an OTP will appear in the backend terminal.</p>
              {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-brand-dim transition-colors disabled:opacity-60">
                  {loading ? 'Sending...' : 'Send OTP'}
                </button>
              </form>
            </>
          )}

          {/* ── Forgot password: enter OTP + new password ── */}
          {step === 'otp' && (
            <>
              <button onClick={goBack} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4">← Back to login</button>
              <h2 className="text-base font-semibold text-gray-900 mb-1">Enter OTP</h2>
              <p className="text-xs text-gray-500 mb-4">Check the backend terminal for your 6-digit OTP.</p>
              {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">OTP</label>
                  <input required maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="6-digit code"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
                  <div className="relative">
                    <input type={showNew ? 'text' : 'password'} required minLength={6} value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); if (passErr) validatePassword(e.target.value); }}
                      onBlur={(e) => validatePassword(e.target.value)}
                      placeholder="Min. 6 chars, uppercase, lowercase, symbol"
                      className={`w-full px-3 py-2 pr-10 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-brand ${passErr ? 'border-red-400 focus:ring-red-300' : 'border-gray-300'}`} />
                    <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showNew ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                  {passErr && <p className="mt-1 text-xs text-red-500">{passErr}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Confirm Password</label>
                  <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-brand-dim transition-colors disabled:opacity-60">
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
              </form>
            </>
          )}

          {/* ── Main login / signup form ── */}
          {step === 'form' && (
            <>
              <div className="flex rounded-lg bg-gray-100 p-1 mb-6">
                {(['login', 'customerSignup'] as const).map((t) => (
                  <button key={t} onClick={() => { setTab(t); setError(''); setSuccess(''); }}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
                    {t === 'login' ? 'Log In' : 'Customer Sign Up'}
                  </button>
                ))}
              </div>

              {error && <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
              {success && <div className="mb-4 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>}

              <form onSubmit={tab === 'login' ? handleLogin : handleCustomerSignup} className="space-y-4">
                {tab === 'customerSignup' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Your name</label>
                    <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" required value={email}
                    onChange={(e) => { setEmail(e.target.value); if (emailErr) validateEmail(e.target.value); }}
                    onBlur={(e) => validateEmail(e.target.value)}
                    placeholder="you@company.com"
                    className={`w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-brand ${emailErr ? 'border-red-400 focus:ring-red-300' : 'border-gray-300'}`} />
                  {emailErr && <p className="mt-1 text-xs text-red-500">{emailErr}</p>}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} required value={password}
                      onChange={(e) => { setPassword(e.target.value); if (passErr) validatePassword(e.target.value); }}
                      onBlur={(e) => validatePassword(e.target.value)}
                      placeholder="••••••••"
                      className={`w-full px-3 py-2 pr-10 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-brand ${passErr ? 'border-red-400 focus:ring-red-300' : 'border-gray-300'}`} />
                    <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                  {passErr && <p className="mt-1 text-xs text-red-500">{passErr}</p>}
                </div>
                <button type="submit" disabled={loading}
                  className="w-full bg-brand text-white py-2 rounded-lg text-sm font-semibold hover:bg-brand-dim transition-colors disabled:opacity-60">
                  {loading ? 'Please wait...' : tab === 'login' ? 'Log In' : 'Create Customer Account'}
                </button>
                {tab === 'login' && (
                  <button type="button" onClick={() => { setStep('forgot'); setError(''); setSuccess(''); }}
                    className="w-full text-sm text-gray-500 hover:text-gray-700 text-center">
                    Forgot Password?
                  </button>
                )}
              </form>
            </>
          )}
        </div>

        {tab === 'customerSignup' && step === 'form' && (
          <p className="mt-3 text-center text-xs text-gray-400">Create an account to view and manage your quotes.</p>
        )}
        <p className="mt-4 text-center text-xs text-gray-400">
          After login, internal users land on the Sales Dashboard.<br />Customers land on their Quotation Portal.
        </p>
      </div>
    </div>
  );
}

function Eye() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.477 0 8.268 2.943 9.542 7-1.274 4.057-5.065 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.477 0-8.268-2.943-9.542-7a9.97 9.97 0 012.5-4.19M9.88 9.88a3 3 0 104.24 4.24M3 3l18 18" />
    </svg>
  );
}
