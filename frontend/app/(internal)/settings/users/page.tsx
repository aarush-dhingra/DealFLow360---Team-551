'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Button, Card, PageHeader, Table, Td, Tr } from '@/components/ui';

type Account = { id: string; email: string; display_name: string; roles: string[]; must_change_password: boolean; is_active: boolean };
const empty = { displayName: '', email: '', password: '', role: 'sales_rep' };

export default function UserManagementPage() {
  const [accounts, setAccounts] = useState<Account[]>([]); const [form, setForm] = useState(empty); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const load = () => api.get<{ data: Account[] }>('/admin/users').then((r) => setAccounts(r.data)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  async function submit(e: FormEvent) { e.preventDefault(); setSaving(true); setError(''); try { await api.post('/admin/users', form); setForm(empty); load(); } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Could not create account.'); } finally { setSaving(false); } }
  return <div className="max-w-5xl"><PageHeader title="Team access" subtitle="Create internal accounts with a temporary password. Each person must set their own password at first sign-in." />
    {error && <p className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</p>}
    <Card className="p-5 mb-6"><form onSubmit={submit} className="grid md:grid-cols-4 gap-3 items-end"><label className="text-xs text-gray-600">Name<input required value={form.displayName} onChange={(e) => setForm({...form, displayName:e.target.value})} className="mt-1 w-full border rounded-lg p-2 text-sm" /></label><label className="text-xs text-gray-600">Email<input type="email" required value={form.email} onChange={(e) => setForm({...form, email:e.target.value})} className="mt-1 w-full border rounded-lg p-2 text-sm" /></label><label className="text-xs text-gray-600">Temporary password<input type="password" minLength={8} required value={form.password} onChange={(e) => setForm({...form, password:e.target.value})} className="mt-1 w-full border rounded-lg p-2 text-sm" /></label><label className="text-xs text-gray-600">Role<select value={form.role} onChange={(e) => setForm({...form, role:e.target.value})} className="mt-1 w-full border rounded-lg p-2 text-sm"><option value="sales_rep">Sales rep</option><option value="sales_manager">Sales manager</option><option value="finance_operations">Finance</option></select></label><Button type="submit" variant="primary" disabled={saving}>{saving ? 'Creating…' : 'Add team member'}</Button></form></Card>
    <Card><Table headers={['Name', 'Email', 'Role', 'First sign-in']} >{accounts.map((account) => <Tr key={account.id}><Td className="font-medium">{account.display_name}</Td><Td>{account.email}</Td><Td>{account.roles.join(', ').replaceAll('_', ' ')}</Td><Td>{account.must_change_password ? 'Password change required' : 'Active'}</Td></Tr>)}</Table></Card>
  </div>;
}
