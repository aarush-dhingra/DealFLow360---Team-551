'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { routeToRisk, type BackendApprovalRoute } from '@/lib/data';
import { PageHeader, RiskBadge, Badge, FilterChip, Card } from '@/components/ui';

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
  const router = useRouter();
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    api.get<{ approvals: ApprovalRow[]; count: number }>('/manager/approvals')
      .then((res) => setApprovals(res.approvals))
      .catch((err) => setError(err.message))
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

      <div className="flex gap-2 mb-5">
        <FilterChip label="Pending"  count={pending.length}  active={filter === 'pending'}  onClick={() => setFilter('pending')}  color="yellow" />
        <FilterChip label="Returned" count={returned.length} active={filter === 'returned'} onClick={() => setFilter('returned')} color="red" />
        <FilterChip label="Approved" count={approved.length} active={filter === 'approved'} onClick={() => setFilter('approved')} color="green" />
        <FilterChip label="All"      active={filter === 'all'}      onClick={() => setFilter('all')} />
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
                {['Quotation', 'Customer', 'Blended Risk', 'Stage', 'Rep'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && displayed.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => router.push(`/approvals/${a.id}`)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-indigo-600">{a.quote_number}</td>
                  <td className="px-4 py-3 text-gray-900">{a.customer_name}</td>
                  <td className="px-4 py-3">
                    <RiskBadge risk={routeToRisk(a.route)} />
                    <span className="ml-1.5 text-xs text-gray-400">{parseFloat(a.blended_risk_percent).toFixed(1)}%</span>
                  </td>
                  <td className="px-4 py-3">{stageLabel(a)}</td>
                  <td className="px-4 py-3 text-gray-600">{a.rep_name}</td>
                </tr>
              ))}
              {!loading && displayed.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No approvals in this filter</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="mt-3 text-xs text-gray-400">Click any row to open its full approval detail, risk breakdown, and audit trail.</p>
    </div>
  );
}
