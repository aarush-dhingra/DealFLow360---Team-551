'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { PageHeader, StatCard, Card } from '@/components/ui';

export default function DashboardPage() {
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);
  const [openQuotations, setOpenQuotations] = useState<number | null>(null);
  const [atRisk, setAtRisk] = useState<number | null>(null);
  const [activity, setActivity] = useState<string[]>([]);

  useEffect(() => {
    api.get<{ approvals: unknown[]; count: number }>('/manager/approvals?status=pending')
      .then((r) => setPendingApprovals(r.count ?? r.approvals?.length ?? 0))
      .catch(() => setPendingApprovals(0));

    api.get<{ quotations: unknown[]; count: number }>('/manager/quotations')
      .then((r) => setOpenQuotations(r.count ?? r.quotations?.length ?? 0))
      .catch(() => setOpenQuotations(0));

    api.get<{ stalled_deals: unknown[]; discount_anomalies: unknown[] }>('/manager/deal-health/dashboard')
      .then((r) => {
        const count = (r.stalled_deals?.length ?? 0) + (r.discount_anomalies?.length ?? 0);
        setAtRisk(count);
        const items: string[] = [];
        if (r.stalled_deals?.length) items.push(`${r.stalled_deals.length} stalled deal(s) flagged by Deal Health`);
        if (r.discount_anomalies?.length) items.push(`${r.discount_anomalies.length} discount anomaly/anomalies detected`);
        setActivity(items);
      })
      .catch(() => setAtRisk(0));
  }, []);

  return (
    <div>
      <PageHeader title="Sales Dashboard" subtitle="Central hub — links out to every module below" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Link href="/approvals">
          <StatCard label="Pending Approvals" value={pendingApprovals ?? '…'} sub="quotations waiting for review" />
        </Link>
        <Link href="/quotations">
          <StatCard label="Open Quotations" value={openQuotations ?? '…'} sub="active deals in pipeline" />
        </Link>
        <Link href="/deal-health">
          <StatCard label="At-Risk Deals" value={atRisk ?? '…'} sub="stalled or anomalous discounts" />
        </Link>
      </div>

      <div className="flex gap-3 mb-6">
        <Link
          href="/quotations/new"
          className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dim transition-colors"
        >
          + New Quotation
        </Link>
        <Link
          href="/approvals"
          className="px-4 py-2 bg-white text-gray-700 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          View Approvals
        </Link>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold text-brand mb-3">Live Alerts</h2>
        {activity.length === 0 ? (
          <p className="text-sm text-gray-400">No active alerts — all deals are healthy.</p>
        ) : (
          <ul className="space-y-2">
            {activity.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-light shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
