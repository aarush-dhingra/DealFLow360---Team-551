'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { routeToRisk, type BackendApprovalRoute } from '@/lib/data';
import { PageHeader, RiskBadge, Badge, Button, Card, Table, Tr, Td, InfoBanner } from '@/components/ui';

interface ApprovalDetail {
  id: string;
  required_role: string;
  status: string;
  quotation_id: string;
  decision_reason: string | null;
  quotation: { quote_number: string; customer_name: string; rep_name: string; customer_tier: string } | null;
  version: { grand_total: string; currency_code: string } | null;
  risk: {
    blended_risk_percent: string;
    route: BackendApprovalRoute;
    total_pre_discount_order_value: string;
    total_line_excess_value: string;
  } | null;
  lines: { product_name: string; line_discount_percent: string; ceiling_percent: string | null }[];
  actions: { actor_display_name: string; action: string; reason: string | null; created_at: string }[];
}

export default function FinanceApprovalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<ApprovalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);
  const [actionResult, setActionResult] = useState('');

  useEffect(() => {
    api.get<{ approval: ApprovalDetail }>(`/manager/approvals/${id}`)
      .then((res) => setDetail(res.approval))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function decide(action: 'approve' | 'reject' | 'return_for_revision') {
    if (!reason.trim() || !detail) return;
    setActing(true);
    try {
      await api.post(
        `/finance/quotations/${detail.quotation_id}/approvals/${id}/decisions`,
        { action, reason: reason.trim() }
      );
      const msg = { approve: 'Approved by Finance.', reject: 'Rejected.', return_for_revision: 'Returned for revision.' }[action];
      setActionResult(msg);
      setTimeout(() => router.push('/finance/approvals'), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading...</div>;
  if (error && !detail) return <div className="p-8 text-red-500 text-sm">Error: {error}</div>;
  if (!detail) return <div className="p-8 text-gray-500">Approval not found.</div>;

  const risk = detail.risk ? routeToRisk(detail.risk.route) : 'HIGH';
  const blendedPct = detail.risk ? parseFloat(detail.risk.blended_risk_percent).toFixed(1) : '0';

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2">← Back</button>
      <PageHeader
        title={`Finance Review: ${detail.quotation?.quote_number ?? id}`}
        subtitle={detail.quotation ? `${detail.quotation.customer_name} - ${detail.quotation.rep_name}` : ''}
      />

      <div className="flex gap-2 mb-5 flex-wrap">
        <RiskBadge risk={risk} />
        <Badge variant="blue">Tier: {detail.quotation?.customer_tier ?? '-'}</Badge>
        <Badge variant="gray">{blendedPct}% blended risk</Badge>
        {detail.version && (
          <Badge variant="gray">
            Total: {detail.version.currency_code} ${parseFloat(detail.version.grand_total).toLocaleString()}
          </Badge>
        )}
      </div>

      {detail.risk && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Risk Breakdown</h2>
          <Card className="mb-5">
            <Table headers={['Metric', 'Value']}>
              <Tr><Td>Total order value</Td><Td>${parseFloat(detail.risk.total_pre_discount_order_value).toLocaleString()}</Td></Tr>
              <Tr><Td>Excess discount value</Td><Td className="text-red-600">${parseFloat(detail.risk.total_line_excess_value).toLocaleString()}</Td></Tr>
              <Tr><Td>Blended risk %</Td><Td className="font-semibold">{blendedPct}%</Td></Tr>
              <Tr><Td>Approval route</Td><Td>{detail.risk.route}</Td></Tr>
            </Table>
          </Card>
        </>
      )}

      {detail.lines?.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Line Items</h2>
          <Card className="mb-5">
            <Table headers={['Product', 'Discount Given', 'Ceiling', 'Over By']}>
              {detail.lines.map((line, i) => {
                const given = parseFloat(line.line_discount_percent);
                const ceiling = line.ceiling_percent ? parseFloat(line.ceiling_percent) : null;
                const over = ceiling !== null ? Math.max(0, given - ceiling) : 0;
                return (
                  <Tr key={i}>
                    <Td>{line.product_name}</Td>
                    <Td>{given.toFixed(1)}%</Td>
                    <Td>{ceiling !== null ? `${ceiling.toFixed(1)}%` : '-'}</Td>
                    <Td>
                      {over === 0
                        ? <Badge variant="green">Within limit</Badge>
                        : <Badge variant="red">{over.toFixed(1)} pts over</Badge>}
                    </Td>
                  </Tr>
                );
              })}
            </Table>
          </Card>
        </>
      )}

      {detail.actions?.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Action History</h2>
          <Card className="mb-6">
            <Table headers={['User', 'Action', 'Date', 'Reason']}>
              {detail.actions.map((entry, i) => (
                <Tr key={i}>
                  <Td className="font-medium">{entry.actor_display_name}</Td>
                  <Td className="capitalize">{entry.action.replace(/[._]/g, ' ')}</Td>
                  <Td className="text-gray-400">{new Date(entry.created_at).toLocaleDateString()}</Td>
                  <Td className="text-gray-500">{entry.reason ?? '-'}</Td>
                </Tr>
              ))}
            </Table>
          </Card>
        </>
      )}

      <InfoBanner>
        Finance decisions are final. Approval advances the quote to confirmed; rejection closes it. Return sends it back to the sales rep.
      </InfoBanner>

      {actionResult ? (
        <div className="mt-6 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          {actionResult}
        </div>
      ) : detail.status === 'pending' ? (
        <div className="mt-6">
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Reason <span className="text-red-500">*</span> <span className="text-gray-400">(required for all Finance decisions)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="State your justification for Finance records..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand resize-none"
            />
          </div>

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 flex-wrap">
            <Button variant="primary" onClick={() => decide('approve')} disabled={acting || !reason.trim()}>Approve</Button>
            <Button variant="warning" onClick={() => decide('return_for_revision')} disabled={acting || !reason.trim()}>Return for Revision</Button>
            <Button variant="danger" onClick={() => decide('reject')} disabled={acting || !reason.trim()}>Reject</Button>
          </div>
        </div>
      ) : (
        <div className="mt-6 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
          <span className="font-medium capitalize">{detail.status.replace(/[._]/g, ' ')}</span>
          {detail.decision_reason && <span className="ml-2 text-gray-500 italic">"{detail.decision_reason}"</span>}
        </div>
      )}
    </div>
  );
}
