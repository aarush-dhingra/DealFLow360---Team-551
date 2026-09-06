'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import { PageHeader, Badge, Card, Button } from '@/components/ui';

interface Plan {
  id: string;
  code: string;
  name: string;
  interval_unit: string;
  is_active: boolean;
  proration_policy: Record<string, unknown>;
  cancellation_policy: Record<string, unknown>;
  created_at: string;
}

function formatPolicy(policy: Record<string, unknown> | null | undefined): string {
  if (!policy || Object.keys(policy).length === 0) return 'Default';
  const parts: string[] = [];
  if (policy.method) parts.push(`Method: ${policy.method}`);
  if (policy.refund) parts.push(`Refund: ${policy.refund}`);
  if (policy.grace_days) parts.push(`Grace: ${policy.grace_days} days`);
  if (policy.notice_days) parts.push(`Notice: ${policy.notice_days} days`);
  return parts.length > 0 ? parts.join(' · ') : Object.entries(policy).map(([k, v]) => `${k}: ${v}`).join(' · ');
}

const intervalLabel: Record<string, string> = {
  month: 'Monthly',
  quarter: 'Quarterly',
  year: 'Annual',
};

const blankForm = {
  code: '',
  name: '',
  intervalUnit: 'month' as 'month' | 'quarter' | 'year',
  prorationMethod: 'daily',
  cancellationRefund: 'prorated',
  cancellationNoticeDays: '',
  isActive: true,
};

export default function SubscriptionsPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function loadPlans() {
    return api.get<{ data: Plan[] }>('/admin/subscription-plans?includeInactive=true')
      .then((r) => setPlans(Array.isArray(r.data) ? r.data : []))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load plans'));
  }

  useEffect(() => {
    const roles = getUser()?.roles ?? [];
    setIsAdmin(roles.includes('admin'));
    loadPlans().finally(() => setLoading(false));
  }, []);

  const active = plans.filter((p) => p.is_active);
  const inactive = plans.filter((p) => !p.is_active);

  function field(key: keyof typeof form, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError('');
    setSaving(true);
    try {
      const prorationPolicy: Record<string, unknown> = {};
      if (form.prorationMethod && form.prorationMethod !== 'none') {
        prorationPolicy.method = form.prorationMethod;
      }
      const cancellationPolicy: Record<string, unknown> = {};
      if (form.cancellationRefund && form.cancellationRefund !== 'none') {
        cancellationPolicy.refund = form.cancellationRefund;
      }
      if (form.cancellationNoticeDays) {
        cancellationPolicy.notice_days = parseInt(form.cancellationNoticeDays, 10);
      }
      await api.post('/admin/subscription-plans', {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        intervalUnit: form.intervalUnit,
        prorationPolicy,
        cancellationPolicy,
        isActive: form.isActive,
      });
      setForm(blankForm);
      setShowForm(false);
      await loadPlans();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <PageHeader
          title="Subscription Plans"
          subtitle="Recurring billing plans available for orders"
        />
        {isAdmin && !showForm && (
          <div className="mt-5">
            <Button variant="primary" onClick={() => setShowForm(true)}>+ New Plan</Button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          {error}
        </div>
      )}

      {isAdmin && showForm && (
        <Card className="mb-6 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New Subscription Plan</h2>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Code <span className="text-red-500">*</span></label>
                <input
                  required
                  value={form.code}
                  onChange={(e) => field('code', e.target.value)}
                  placeholder="e.g. ANNUAL-PREMIUM"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => field('name', e.target.value)}
                  placeholder="e.g. Annual Premium Support"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Billing Cycle <span className="text-red-500">*</span></label>
                <select
                  value={form.intervalUnit}
                  onChange={(e) => field('intervalUnit', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="month">Monthly</option>
                  <option value="quarter">Quarterly</option>
                  <option value="year">Annual</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Proration Method</label>
                <select
                  value={form.prorationMethod}
                  onChange={(e) => field('prorationMethod', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="daily">Daily</option>
                  <option value="monthly">Monthly</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cancellation Refund</label>
                <select
                  value={form.cancellationRefund}
                  onChange={(e) => field('cancellationRefund', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                >
                  <option value="prorated">Prorated</option>
                  <option value="full">Full</option>
                  <option value="none">None</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notice Days (optional)</label>
                <input
                  type="number"
                  min={0}
                  value={form.cancellationNoticeDays}
                  onChange={(e) => field('cancellationNoticeDays', e.target.value)}
                  placeholder="e.g. 30"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => field('isActive', e.target.checked)}
                className="rounded border-gray-300 text-brand focus:ring-brand"
              />
              Active (visible to sales reps)
            </label>

            {saveError && <p className="text-sm text-red-600">{saveError}</p>}

            <div className="flex gap-3">
              <Button variant="primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Create Plan'}
              </Button>
              <Button variant="secondary" type="button" onClick={() => { setShowForm(false); setSaveError(''); setForm(blankForm); }}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Active Plans</p>
          <p className="text-2xl font-bold text-gray-900">{loading ? '…' : active.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Billing Cycles</p>
          <p className="text-2xl font-bold text-gray-900">{loading ? '…' : new Set(active.map((p) => p.interval_unit)).size}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Inactive Plans</p>
          <p className="text-2xl font-bold text-gray-900">{loading ? '…' : inactive.length}</p>
        </Card>
      </div>

      <h2 className="text-sm font-semibold text-gray-700 mb-3">Active Plans</h2>
      <Card className="mb-6">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">Loading…</p>
        ) : active.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No active subscription plans configured.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Plan', 'Code', 'Billing Cycle', 'Proration', 'Cancellation', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {active.map((plan) => (
                  <tr key={plan.id} onClick={() => router.push(`/subscriptions/${plan.id}`)} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3 font-medium text-gray-900">{plan.name}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">{plan.code}</td>
                    <td className="px-4 py-3">
                      <Badge variant="blue">{intervalLabel[plan.interval_unit] ?? plan.interval_unit}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{formatPolicy(plan.proration_policy)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{formatPolicy(plan.cancellation_policy)}</td>
                    <td className="px-4 py-3"><Badge variant="green">Active</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {!loading && inactive.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Inactive Plans</h2>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Plan', 'Code', 'Billing Cycle', 'Status'].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {inactive.map((plan) => (
                    <tr key={plan.id} onClick={() => router.push(`/subscriptions/${plan.id}`)} className="opacity-60 cursor-pointer">
                      <td className="px-4 py-3 font-medium text-gray-700">{plan.name}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">{plan.code}</td>
                      <td className="px-4 py-3">
                        <Badge variant="gray">{intervalLabel[plan.interval_unit] ?? plan.interval_unit}</Badge>
                      </td>
                      <td className="px-4 py-3"><Badge variant="gray">Inactive</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
