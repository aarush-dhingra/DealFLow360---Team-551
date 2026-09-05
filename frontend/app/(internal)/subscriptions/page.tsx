'use client';

import { useEffect, useState } from 'react';
import { api, getUser } from '@/lib/api';
import { PageHeader, Badge, Card } from '@/components/ui';

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

const intervalLabel: Record<string, string> = {
  month: 'Monthly',
  quarter: 'Quarterly',
  year: 'Annual',
};

export default function SubscriptionsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const roles = getUser()?.roles ?? [];
    setIsAdmin(roles.includes('admin'));
    api.get<{ data: Plan[] }>('/admin/subscription-plans')
      .then((r) => setPlans(Array.isArray(r.data) ? r.data : []))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load plans'))
      .finally(() => setLoading(false));
  }, []);

  const active = plans.filter((p) => p.is_active);
  const inactive = plans.filter((p) => !p.is_active);

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <PageHeader
          title="Subscription Plans"
          subtitle="Recurring billing plans available for orders"
        />
        {isAdmin && (
          <span className="mt-5 text-xs text-gray-400">Manage via Admin Config</span>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          {error}
        </div>
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
                {active.map((plan) => {
                  const proration = Object.keys(plan.proration_policy ?? {}).length > 0
                    ? JSON.stringify(plan.proration_policy)
                    : 'Default';
                  const cancellation = Object.keys(plan.cancellation_policy ?? {}).length > 0
                    ? JSON.stringify(plan.cancellation_policy)
                    : 'Default';
                  return (
                    <tr key={plan.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{plan.name}</td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500">{plan.code}</td>
                      <td className="px-4 py-3">
                        <Badge variant="blue">{intervalLabel[plan.interval_unit] ?? plan.interval_unit}</Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{proration}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{cancellation}</td>
                      <td className="px-4 py-3"><Badge variant="green">Active</Badge></td>
                    </tr>
                  );
                })}
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
                    <tr key={plan.id} className="opacity-60">
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
