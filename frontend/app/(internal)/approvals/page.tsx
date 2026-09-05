'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRoleGuard } from '@/lib/useRoleGuard';
import { routeToRisk, type BackendApprovalRoute } from '@/lib/data';
import { PageHeader, RiskBadge, Badge, Card } from '@/components/ui';

interface ApprovalRow {
  id: string;
  sequence_number: number;
  required_role: string;
  status: string;
  created_at: string;
  decided_at: string | null;
  quotation_id: string;
  quote_number: string;
  quote_status: string;
  customer_name: string;
  rep_name: string;
  assigned_to: string | null;
  blended_risk_percent: string;
  route: BackendApprovalRoute;
}

type Filter = 'all' | 'pending' | 'returned' | 'approved';

function stageLabel(row: ApprovalRow) {
  if (row.required_role === 'finance_operations') return <Badge variant="blue">Finance</Badge>;
  return <Badge variant="yellow">Sales Manager</Badge>;
}

export default function ApprovalsPage() {
  useRoleGuard(['sales_manager', 'admin']);
  const router = useRouter();
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    api.get<{ approvals: ApprovalRow[]; count: number }>('/manager/approvals')
      .then((res) => setApprovals(res.approvals))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const pending  = approvals.filter((a) => a.status === 'pending');
  const returned = approvals.filter((a) => a.status === 'returned_for_revision');
  const approved = approvals.filter((a) => ['approved', 'escalated'].includes(a.status));

  const displayed =
    filter === 'pending'  ? pending  :
    filter === 'returned' ? returned :
    filter === 'approved' ? approved :
    approvals;

  return (
    <div>
      <PageHeader title="Approvals" subtitle="Every quotation that needed, needs, or has gone through discount approval" />

      <div className="flex items-center gap-3 mb-5">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="all">All ({approvals.length})</option>
          <option value="pending">Pending ({pending.length})</option>
          <option value="returned">Returned ({returned.length})</option>
          <option value="approved">Approved ({approved.length})</option>
        </select>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Could not reach backend: {error}
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Quotation', 'Customer', 'Blended Risk', 'Stage', 'Status', 'Rep'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && displayed.map((a) => {
                const isDone = ['approved', 'escalated', 'rejected', 'returned_for_revision'].includes(a.status);
                const statusBadge = {
                  pending: <Badge variant="yellow">Pending</Badge>,
                  approved: <Badge variant="green">Approved</Badge>,
                  escalated: <Badge variant="blue">Escalated</Badge>,
                  rejected: <Badge variant="red">Rejected</Badge>,
                  returned_for_revision: <Badge variant="gray">Returned</Badge>,
                }[a.status] ?? <Badge variant="gray">{a.status}</Badge>;
                return (
                  <tr
                    key={a.id}
                    onClick={() => router.push(`/approvals/${a.id}`)}
                    className={`cursor-pointer hover:bg-gray-50 transition-colors ${isDone ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-brand">{a.quote_number}</td>
                    <td className="px-4 py-3 text-gray-900">{a.customer_name}</td>
                    <td className="px-4 py-3">
                      <RiskBadge risk={routeToRisk(a.route)} />
                      <span className="ml-1.5 text-xs text-gray-400">{(parseFloat(a.blended_risk_percent) || 0).toFixed(1)}%</span>
                    </td>
                    <td className="px-4 py-3">{stageLabel(a)}</td>
                    <td className="px-4 py-3">{statusBadge}</td>
                    <td className="px-4 py-3 text-gray-600">{a.rep_name}</td>
                  </tr>
                );
              })}
              {!loading && displayed.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No approvals in this filter</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-3 text-xs text-gray-400">Click any row to open its full approval detail, risk breakdown, and audit trail.</p>
    </div>
  );
}
