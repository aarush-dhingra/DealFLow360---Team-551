'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import { useLiveUpdates } from '@/lib/useLiveUpdates';
import { useRoleGuard } from '@/lib/useRoleGuard';
import { routeToRisk, type BackendApprovalRoute } from '@/lib/risk';
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
interface NegotiationRow { quotation_id:string; quote_number:string; customer_name:string; owner_role:string; last_handoff_reason:string|null; }

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
  const [negotiations, setNegotiations] = useState<NegotiationRow[]>([]);

  const isAdmin = getUser()?.roles?.includes('admin') ?? false;

  const load = useCallback(() => {
    api.get<{ approvals: ApprovalRow[]; count: number }>('/manager/approvals')
      .then((res) => {
        const all = res.approvals;
        // Non-admin managers can only act on sales_manager items; admins see everything
        setApprovals(isAdmin ? all : all.filter((a) => a.required_role === 'sales_manager'));
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
    api.get<{cases:NegotiationRow[]}>('/negotiations').then(r => setNegotiations(r.cases)).catch(() => {});
  }, [isAdmin]);
  useEffect(() => { load(); }, [load]);
  useLiveUpdates(load);

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

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {([
          { key: 'all',      label: 'All',      count: approvals.length, color: 'bg-gray-100 text-gray-700 border-gray-200' },
          { key: 'pending',  label: 'Pending',  count: pending.length,   color: 'bg-amber-100 text-amber-800 border-amber-300' },
          { key: 'returned', label: 'Returned', count: returned.length,  color: 'bg-red-100 text-red-700 border-red-300' },
          { key: 'approved', label: 'Approved', count: approved.length,  color: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
        ] as const).map(({ key, label, count, color }) => (
          <button
            key={key}
            onClick={() => setFilter(key as Filter)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${color} ${filter === key ? 'ring-2 ring-offset-1 ring-brand' : 'opacity-70 hover:opacity-100'}`}
          >
            {count} {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Could not reach backend: {error}
        </div>
      )}

      {negotiations.length > 0 && (
        <Card className="mb-5 p-4 border-blue-200 bg-blue-50"><h2 className="text-sm font-semibold text-blue-900">Open customer negotiations</h2><p className="mt-1 text-xs text-blue-700">These are active customer conversations, not approval decisions.</p><div className="mt-3 grid md:grid-cols-2 gap-2">{negotiations.map(n=><button key={n.quotation_id} onClick={()=>router.push(`/negotiations/${n.quotation_id}`)} className="text-left rounded border border-blue-100 bg-white px-3 py-2 hover:border-brand"><p className="text-sm font-medium">{n.customer_name}</p><p className="text-xs text-gray-500">{n.quote_number} · Continue negotiation</p>{n.last_handoff_reason&&<p className="mt-1 text-xs text-gray-500">{n.last_handoff_reason}</p>}</button>)}</div></Card>
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
