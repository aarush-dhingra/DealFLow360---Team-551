import Link from 'next/link';
import { PageHeader, StatCard, Card } from '@/components/ui';
import { quotations, dealHealthAlerts } from '@/lib/data';

export default function DashboardPage() {
  const pendingApprovals = quotations.filter((q) => q.status === 'Pending Approval').length;
  const openQuotations = quotations.filter((q) => q.status !== 'Confirmed').length;
  const atRisk = dealHealthAlerts.length;

  const recentActivity = [
    'Acme Corp quotation approved by Finance',
    'Beta Industries requested a discount change',
    'East Depot stock updated for Order #2291',
  ];

  return (
    <div>
      <PageHeader title="Sales Dashboard" subtitle="Central hub - links out to every module below" />

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Link href="/approvals">
          <StatCard label="Pending Approvals" value={pendingApprovals} sub={`${pendingApprovals} quotations waiting`} />
        </Link>
        <Link href="/quotations">
          <StatCard label="Open Quotations" value={openQuotations} sub={`${openQuotations} active deals`} />
        </Link>
        <Link href="/deal-health">
          <StatCard label="At-Risk Deals" value={atRisk} sub={`${atRisk} flagged by Deal Health`} />
        </Link>
      </div>

      {/* Actions */}
      <div className="flex gap-3 mb-6">
        <Link
          href="/quotations"
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

      {/* Recent Activity */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold text-brand mb-3">Recent Activity</h2>
        <ul className="space-y-2">
          {recentActivity.map((item) => (
            <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
              <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-light shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
