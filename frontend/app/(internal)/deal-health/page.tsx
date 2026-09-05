'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader, StatCard, Badge, Button, Card, Table, Tr, Td } from '@/components/ui';

interface StalledDeal {
  id: string;
  quote_number: string;
  customer_name: string;
  inactivity_days: number;
  score: number | null;
}

interface DiscountAnomaly {
  id: string;
  quote_number: string;
  customer_name: string;
  blended_risk_percent: string;
  route: string;
}

interface DashboardData {
  stalled_deals: StalledDeal[];
  discount_anomalies: DiscountAnomaly[];
  pending_approvals: {
    sales_manager: number;
    finance_operations: number;
    total: number;
  };
}

export default function DealHealthPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nudging, setNudging] = useState<string | null>(null);

  useEffect(() => {
    api.get<DashboardData>('/manager/deal-health/dashboard')
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function nudge(quotationId: string) {
    setNudging(quotationId);
    try {
      await api.post(`/manager/deal-health/quotations/${quotationId}/nudge`);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Nudge failed');
    } finally {
      setNudging(null);
    }
  }

  if (loading) return (
    <div>
      <PageHeader title="Deal Health and Anomaly Dashboard" subtitle="Real-time flags for stalled deals and unusual discount patterns" />
      <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
    </div>
  );

  if (error) return (
    <div>
      <PageHeader title="Deal Health and Anomaly Dashboard" subtitle="Real-time flags for stalled deals and unusual discount patterns" />
      <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        Could not reach backend: {error}
      </div>
    </div>
  );

  const stalled = data?.stalled_deals ?? [];
  const anomalies = data?.discount_anomalies ?? [];
  const pending = data?.pending_approvals ?? { sales_manager: 0, finance_operations: 0, total: 0 };

  return (
    <div>
      <PageHeader title="Deal Health and Anomaly Dashboard" subtitle="Real-time flags for stalled deals and unusual discount patterns" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Stalled Deals" value={stalled.length} sub={`Idle 7+ days`} />
        <StatCard label="Discount Anomalies" value={anomalies.length} sub="Above rep average" />
        <StatCard label="Pending Approvals" value={pending.total} sub={`Manager: ${pending.sales_manager} / Finance: ${pending.finance_operations}`} />
      </div>

      {stalled.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Stalled Deals</h2>
          <Card className="mb-5">
            <Table headers={['Quote', 'Customer', 'Idle Days', 'Action']}>
              {stalled.map((deal) => (
                <Tr key={deal.id}>
                  <Td className="font-medium text-brand">{deal.quote_number}</Td>
                  <Td>{deal.customer_name}</Td>
                  <Td><Badge variant="yellow">{deal.inactivity_days} days idle</Badge></Td>
                  <Td>
                    <Button
                      variant="primary"
                      onClick={() => nudge(deal.id)}
                      disabled={nudging === deal.id}
                    >
                      {nudging === deal.id ? 'Nudging...' : 'Nudge Rep'}
                    </Button>
                  </Td>
                </Tr>
              ))}
            </Table>
          </Card>
        </>
      )}

      {anomalies.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Discount Anomalies</h2>
          <Card className="mb-5">
            <Table headers={['Quote', 'Customer', 'Blended Risk %', 'Route']}>
              {anomalies.map((a, i) => (
                <Tr key={a.quote_number ?? i}>
                  <Td className="font-medium text-brand">{a.quote_number}</Td>
                  <Td>{a.customer_name}</Td>
                  <Td><Badge variant="red">{(parseFloat(a.blended_risk_percent) || 0).toFixed(1)}%</Badge></Td>
                  <Td className="text-gray-600">{a.route ?? '—'}</Td>
                </Tr>
              ))}
            </Table>
          </Card>
        </>
      )}

      {stalled.length === 0 && anomalies.length === 0 && (
        <div className="text-center py-16 text-gray-400 text-sm">No active alerts - all deals are healthy.</div>
      )}
    </div>
  );
}
