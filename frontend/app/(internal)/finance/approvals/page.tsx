'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRoleGuard } from '@/lib/useRoleGuard';
import { routeToRisk, type BackendApprovalRoute } from '@/lib/data';
import { PageHeader, Card, Table, Tr, Td, Badge, RiskBadge } from '@/components/ui';

interface FinanceApproval {
  id: string;
  status: string;
  required_role: string;
  created_at: string;
  quotation_id: string;
  quote_number: string;
  customer_name: string;
  rep_name: string;
  blended_risk_percent: string;
  route: BackendApprovalRoute;
}

export default function FinanceApprovalsPage() {
  useRoleGuard(['finance_operations', 'admin']);
  const router = useRouter();
  const [approvals, setApprovals] = useState<FinanceApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ approvals: FinanceApproval[]; count: number }>('/manager/approvals?required_role=finance_operations&status=pending')
      .then((res) => setApprovals(res.approvals))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Finance Approvals" subtitle="Quotations escalated to Finance for final sign-off" />

      {error && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Could not reach backend: {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No pending finance approvals.</div>
      ) : (
        <Card>
          <Table headers={['Quote', 'Customer', 'Rep', 'Blended Risk', 'Risk Level', 'Received']}>
            {approvals.map((a) => {
              const risk = a.route ? routeToRisk(a.route) : 'HIGH';
              return (
                <Tr key={a.id} onClick={() => router.push(`/finance/approvals/${a.id}`)} clickable>
                  <Td className="font-medium text-brand">{a.quote_number ?? a.quotation_id.slice(0, 8)}</Td>
                  <Td>{a.customer_name ?? '-'}</Td>
                  <Td className="text-gray-500">{a.rep_name ?? '-'}</Td>
                  <Td>{a.blended_risk_percent ? `${(parseFloat(a.blended_risk_percent) || 0).toFixed(1)}%` : '-'}</Td>
                  <Td><RiskBadge risk={risk} /></Td>
                  <Td className="text-gray-400">{new Date(a.created_at).toLocaleDateString()}</Td>
                </Tr>
              );
            })}
          </Table>
        </Card>
      )}
    </div>
  );
}
