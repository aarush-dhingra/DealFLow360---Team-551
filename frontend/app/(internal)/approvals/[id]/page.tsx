'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import { routeToRisk, type BackendApprovalRoute } from '@/lib/data';
import { PageHeader, RiskBadge, Badge, InfoBanner, Button, Card, PipelineStep, Table, Tr, Td } from '@/components/ui';

interface ApprovalDetail {
  id: string;
  required_role: string;
  status: string;
  decision_reason: string | null;
  decided_at: string | null;
  created_at: string;
  quotation_id: string;
  assigned_to: string | null;
  decided_by: string | null;
  quotation: {
    quote_number: string;
    status: string;
    customer_name: string;
    customer_tier: string;
    rep_name: string;
  } | null;
  version: {
    grand_total: string;
    currency_code: string;
  } | null;
  risk: {
    blended_risk_percent: string;
    route: BackendApprovalRoute;
    total_pre_discount_order_value: string;
    total_line_excess_value: string;
  } | null;
  lines: { product_name: string; line_discount_percent: string; ceiling_percent: string | null }[];
  actions: { actor_display_name: string; action: string; reason: string | null; created_at: string }[];
}

export default function ApprovalDetailPage() {
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

  async function doAction(action: 'approve' | 'reject' | 'return' | 'escalate') {
    if (action !== 'approve' && !reason.trim()) return;
    setActing(true);
    try {
      const endpoint = action === 'return' ? 'return' : action;
      await api.post(`/manager/approvals/${id}/${endpoint}`, { reason: reason.trim() || 'Approved' });
      const msg = { approve: 'Approved successfully.', reject: 'Rejected.', return: 'Returned for revision.', escalate: 'Escalated to Finance.' }[action];
      setActionResult(msg);
      setTimeout(() => router.push('/approvals'), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading...</div>;
  if (error && !detail) return <div className="p-8 text-red-500 text-sm">Error: {error}</div>;
  if (!detail) return <div className="p-8 text-gray-500">Approval not found.</div>;

  const userRoles = getUser()?.roles ?? [];
  const isAdmin = userRoles.includes('admin');
  const isPureSalesManager = userRoles.includes('sales_manager') && !isAdmin;
  const cannotAct = isPureSalesManager && detail.required_role === 'finance_operations';

  const risk = detail.risk ? routeToRisk(detail.risk.route) : 'LOW';
  const blendedPct = detail.risk ? parseFloat(detail.risk.blended_risk_percent).toFixed(1) : '0';
  const pipelineSteps = ['Submitted', 'Sales Manager', 'Finance', 'Confirmed'];
  const currentStep = detail.required_role === 'finance_operations' ? 2 : 1;

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2">← Back</button>
      <PageHeader
        title={`Approval: ${detail.quotation?.quote_number ?? id}`}
        subtitle={detail.quotation ? `${detail.quotation.customer_name} - ${detail.quotation.rep_name}` : ''}
      />

      <div className="flex gap-2 mb-5">
        <RiskBadge risk={risk} />
        <Badge variant="blue">Customer Tier: {detail.quotation?.customer_tier ?? '-'}</Badge>
        <Badge variant="gray">{blendedPct}% blended risk</Badge>
      </div>

      {detail.risk && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Risk Breakdown</h2>
          <Card className="mb-5">
            <Table headers={['Metric', 'Value']}>
              <Tr><Td>Total order value</Td><Td>${parseFloat(detail.risk.total_pre_discount_order_value).toLocaleString()}</Td></Tr>
              <Tr><Td>Excess discount value</Td><Td className="text-red-600">${parseFloat(detail.risk.total_line_excess_value).toLocaleString()}</Td></Tr>
              <Tr><Td>Blended risk %</Td><Td>{blendedPct}%</Td></Tr>
              <Tr><Td>Route</Td><Td>{detail.risk.route}</Td></Tr>
            </Table>
          </Card>
        </>
      )}

      {detail.lines?.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Lines</h2>
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
                      {over === 0 ? (
                        <Badge variant="green">0 pt - OK</Badge>
                      ) : (
                        <Badge variant="red">{over.toFixed(1)} pt OVER</Badge>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </Table>
          </Card>
        </>
      )}

      <InfoBanner>
        Blended risk is computed as line excess discount value / total pre-discount order value. One over-limit line can escalate the whole quote.
      </InfoBanner>

      <div className="mt-6 mb-5">
        <PipelineStep steps={pipelineSteps} current={currentStep} />
      </div>

      {detail.actions?.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Audit Trail</h2>
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

      {actionResult ? (
        <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          {actionResult}
        </div>
      ) : detail.status === 'returned_for_revision' ? (
        <div className="px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800 flex items-center justify-between gap-3">
          <div>
            <span className="font-medium">Returned for Revision</span>
            {detail.decision_reason && <span className="ml-2 text-amber-700">"{detail.decision_reason}"</span>}
          </div>
          <button
            onClick={() => router.push(`/quotations/${detail.quotation_id}`)}
            className="shrink-0 px-3 py-1.5 rounded-lg border border-amber-400 text-xs font-medium text-amber-900 hover:bg-amber-100 transition-colors"
          >
            Open Quotation →
          </button>
        </div>
      ) : detail.status === 'pending' ? (
        cannotAct ? (
          <div className="px-4 py-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 flex items-center justify-between gap-3">
            <div>
              <span className="font-medium">Finance Operations approval required</span>
              <p className="mt-0.5 text-blue-600">This item is assigned to Finance — Sales Managers cannot act on it. It will be handled by the Finance team.</p>
            </div>
            <button
              onClick={() => router.push(`/quotations/${detail.quotation_id}`)}
              className="shrink-0 px-3 py-1.5 rounded-lg border border-blue-300 text-xs font-medium text-blue-900 hover:bg-blue-100 transition-colors"
            >
              View Quotation →
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Reason / Note <span className="text-gray-400">(required for Return or Reject)</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Add a reason, justification, or note for the record..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand resize-none"
              />
            </div>

            {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

            <div className="flex gap-3 flex-wrap">
              <Button variant="primary" onClick={() => doAction('approve')} disabled={acting}>Approve</Button>
              <Button variant="warning" onClick={() => doAction('return')} disabled={acting || !reason.trim()}>Return for Revision</Button>
              <Button variant="danger"  onClick={() => doAction('reject')} disabled={acting || !reason.trim()}>Reject</Button>
              {detail.required_role === 'sales_manager' && (
                <Button variant="secondary" onClick={() => doAction('escalate')} disabled={acting || !reason.trim()}>Escalate to Finance</Button>
              )}
            </div>
          </>
        )
      ) : (
        <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600">
          <span className="font-medium capitalize">{detail.status.replace(/_/g, ' ')}</span>
          {detail.decision_reason && <span className="ml-2 text-gray-500 italic">"{detail.decision_reason}"</span>}
        </div>
      )}
    </div>
  );
}
