'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader, InfoBanner, Button, Card, Table, Tr, Td } from '@/components/ui';

interface Tier { code: string; display_name: string; entitlement_discount_percent: string }
interface Category { code: string; display_name: string; discount_ceiling_percent: string }
interface Policy { manager_max_blended_risk_percent: string; high_risk_route: string }

export default function DiscountTiersPage() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [policyForm, setPolicyForm] = useState({ manager_max_blended_risk_percent: '', high_risk_route: 'manager_then_finance' });

  useEffect(() => {
    Promise.all([
      api.get<{ tiers: Tier[] }>('/manager/config/tiers'),
      api.get<{ categories: Category[] }>('/manager/config/categories'),
      api.get<{ policy: Policy }>('/manager/config/approval-policy'),
    ])
      .then(([t, c, p]) => {
        setTiers(t.tiers);
        setCategories(c.categories);
        setPolicy(p.policy);
        setPolicyForm({
          manager_max_blended_risk_percent: p.policy.manager_max_blended_risk_percent,
          high_risk_route: p.policy.high_risk_route,
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function savePolicy() {
    setSaving(true);
    try {
      await api.put('/manager/config/approval-policy', {
        manager_max_blended_risk_percent: parseFloat(policyForm.manager_max_blended_risk_percent),
        high_risk_route: policyForm.high_risk_route,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Discount Tiers and Approval Chains" subtitle="Configure discount ceilings and approval routing" />

      {error && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Could not reach backend: {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading config...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-6">
            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tier Discount Ceilings</h2>
              <Card>
                <Table headers={['Tier', 'Max Discount']}>
                  {tiers.map((t) => (
                    <Tr key={t.code}>
                      <Td className="font-medium">{t.display_name}</Td>
                      <Td>{parseFloat(t.entitlement_discount_percent).toFixed(0)}%</Td>
                    </Tr>
                  ))}
                </Table>
              </Card>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Category Discount Ceilings</h2>
              <Card>
                <Table headers={['Category', 'Max Discount']}>
                  {categories.map((c) => (
                    <Tr key={c.code}>
                      <Td className="font-medium">{c.display_name}</Td>
                      <Td>{parseFloat(c.discount_ceiling_percent).toFixed(0)}%</Td>
                    </Tr>
                  ))}
                </Table>
              </Card>
            </div>
          </div>

          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Approval Policy</h2>
          <Card className="p-5 mb-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Manager max blended risk %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={policyForm.manager_max_blended_risk_percent}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, manager_max_blended_risk_percent: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">High risk route</label>
                <select
                  value={policyForm.high_risk_route}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, high_risk_route: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                >
                  <option value="manager_then_finance">Manager then Finance</option>
                  <option value="finance_direct">Finance Direct</option>
                </select>
              </div>
            </div>
          </Card>

          <InfoBanner>
            When a quote mixes categories with different ceilings, the system computes a blended risk score and routes to the highest required level.
            <br />All approvals, rejections, and edits are logged with user, timestamp, and reason.
          </InfoBanner>

          <div className="mt-5">
            <Button variant="primary" onClick={savePolicy} disabled={saving}>
              {saving ? 'Saving...' : saved ? 'Saved' : 'Save Configuration'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
