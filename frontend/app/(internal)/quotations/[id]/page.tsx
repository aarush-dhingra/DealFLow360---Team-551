'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import { routeToRisk, type BackendApprovalRoute } from '@/lib/data';
import { PageHeader, Badge, RiskBadge, InfoBanner, Button, Card } from '@/components/ui';

interface QuoteLine {
  id: string;
  line_number: number;
  name?: string;
  product_name?: string;
  sku: string;
  quantity: string;
  unit_price: string;
  line_discount_percent: string;
  net_line_value?: string;
}

interface QuoteDetail {
  quote: { id: string; quote_number: string; status: string; lock_version: number };
  version: { version_number: number; grand_total: string; currency_code: string; discount_mode: string };
  lines: QuoteLine[];
  risk: { blended_risk_percent: string; route: BackendApprovalRoute } | null;
  approvals: { id: string; required_role: string; status: string }[];
}

interface ManagerQuoteRaw {
  id: string;
  quote_number: string;
  status: string;
  lock_version: number;
  customer_name?: string;
  owner_name?: string;
  version?: {
    version_number: number;
    grand_total: string;
    currency_code: string;
    discount_mode: string;
    lines?: QuoteLine[];
  };
}

interface HealthAssessment {
  score: string;
  band: string;
  inactivity_days: number;
  negotiation_turns: number;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  actor_user_id: string | null;
  occurred_at: string;
  metadata: Record<string, unknown>;
}

interface EditLine {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  lineDiscountPercent: number;
  unitPrice: number;
}

const bandColor: Record<string, string> = {
  green: 'text-emerald-600 bg-emerald-50',
  yellow: 'text-amber-700 bg-amber-50',
  red: 'text-red-600 bg-red-50',
  healthy: 'text-emerald-600 bg-emerald-50',
  warning: 'text-amber-700 bg-amber-50',
  critical: 'text-red-600 bg-red-50',
};

// Rep can edit these statuses; manager/finance always read-only
const REP_EDITABLE = new Set(['draft', 'returned_for_revision', 'negotiation']);

function safeNum(v: string | number | null | undefined): number {
  const n = parseFloat(String(v ?? '0'));
  return isFinite(n) ? n : 0;
}

export default function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [health, setHealth] = useState<HealthAssessment | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [showTimeline, setShowTimeline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editLines, setEditLines] = useState<EditLine[]>([]);

  useEffect(() => {
    const roles = getUser()?.roles ?? [];
    setUserRoles(roles);
    setRolesLoaded(true);
  }, []);

  const isManager = userRoles.includes('sales_manager') || userRoles.includes('admin');
  const isFinance = userRoles.includes('finance_operations') && !isManager;
  const isViewer = isManager || isFinance;

  useEffect(() => {
    if (!rolesLoaded) return;

    if (isViewer) {
      api.get<{ quotation: ManagerQuoteRaw }>(`/manager/quotations/${id}`)
        .then((res) => {
          const q = res.quotation;
          setDetail({
            quote: { id: q.id, quote_number: q.quote_number, status: q.status, lock_version: q.lock_version },
            version: {
              version_number: q.version?.version_number ?? 1,
              grand_total: q.version?.grand_total ?? '0',
              currency_code: q.version?.currency_code ?? 'USD',
              discount_mode: q.version?.discount_mode ?? 'line',
            },
            lines: q.version?.lines ?? [],
            risk: null,
            approvals: [],
          });
        })
        .catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    } else {
      Promise.all([
        api.get<{ data: QuoteDetail }>(`/sales-rep/quotations/${id}`),
        api.get<{ data: HealthAssessment | null }>(`/sales-rep/quotations/${id}/health`).catch(() => ({ data: null })),
        api.get<{ data: TimelineEvent[] }>(`/sales-rep/quotations/${id}/timeline`).catch(() => ({ data: [] })),
      ]).then(([detailRes, healthRes, timelineRes]) => {
        setDetail(detailRes.data);
        setHealth(healthRes.data);
        setTimeline(timelineRes.data ?? []);
        setEditLines(detailRes.data.lines.map((l) => ({
          productId: l.id,
          productName: l.name ?? l.product_name ?? l.sku,
          sku: l.sku,
          quantity: safeNum(l.quantity),
          lineDiscountPercent: safeNum(l.line_discount_percent),
          unitPrice: safeNum(l.unit_price),
        })));
      }).catch((err) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoading(false));
    }
  }, [rolesLoaded, isViewer, id]);

  const isEditable = !isViewer && detail ? REP_EDITABLE.has(detail.quote.status) : false;

  function updateEditLine(i: number, field: 'quantity' | 'lineDiscountPercent', val: number) {
    setEditLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  }

  const editTotal = editLines.reduce((s, l) => s + l.quantity * l.unitPrice * (1 - l.lineDiscountPercent / 100), 0);

  async function saveRevision(andSubmit: boolean) {
    if (!detail) return;
    setSubmitting(true); setError('');
    try {
      const body = {
        discountMode: 'line',
        currencyCode: detail.version.currency_code,
        reason: detail.quote.status === 'negotiation' ? 'Agreed terms with customer' : 'Revised after feedback',
        expectedLockVersion: detail.quote.lock_version,
        lines: editLines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          lineDiscountPercent: l.lineDiscountPercent,
        })),
      };
      await api.post(`/sales-rep/quotations/${id}/revisions`, body);
      if (andSubmit) {
        await api.post(`/sales-rep/quotations/${id}/submit`, {});
      }
      router.push('/quotations');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading...</div>;
  if (error && !detail) return <div className="p-8 text-red-500 text-sm">Error: {error}</div>;
  if (!detail) return <div className="p-8 text-gray-500">Quotation not found.</div>;

  const risk = detail.risk ? routeToRisk(detail.risk.route) : 'LOW';
  const blendedPct = detail.risk ? safeNum(detail.risk.blended_risk_percent).toFixed(1) : '0';
  const grandTotal = safeNum(detail.version.grand_total);

  const statusLabel: Record<string, string> = {
    draft: 'Draft',
    pending_manager_approval: 'Awaiting Manager Approval',
    pending_finance_approval: 'Awaiting Finance Approval',
    returned_for_revision: 'Returned for Revision',
    approved: 'Approved',
    rejected: 'Rejected',
    negotiation: 'Under Negotiation',
    paid: 'Paid',
    confirmed: 'Confirmed',
    in_fulfillment: 'In Fulfillment',
  };

  // Customer counter offer events from timeline
  const counterOffers = timeline.filter((e) =>
    e.event_type === 'negotiation_message_sent' || e.event_type.includes('counter')
  );

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2">← Back</button>
      <PageHeader
        title={`Quotation ${detail.quote.quote_number}`}
        subtitle={`Version ${detail.version.version_number} · ${detail.version.currency_code} · ${statusLabel[detail.quote.status] ?? detail.quote.status}`}
      />

      {/* Viewer banner */}
      {isViewer && (
        <div className="mb-4 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <span className="font-medium">{isManager ? 'Manager view' : 'Finance view'}</span> — read-only. Actions are available in the Approvals section.
        </div>
      )}

      {/* Status banners for rep */}
      {detail.quote.status === 'returned_for_revision' && !isViewer && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-300 rounded-lg text-sm text-amber-800">
          This quote was returned for revision. Edit the lines below and click <strong>Update</strong> to resubmit — the system will auto-route based on your discount.
        </div>
      )}
      {detail.quote.status === 'negotiation' && !isViewer && (
        <div className="mb-4 px-4 py-3 bg-purple-50 border border-purple-300 rounded-lg text-sm text-purple-800">
          <strong>Customer has submitted a counter offer.</strong> Review the timeline below for their request, adjust the discount if you agree, then click <strong>Update</strong> to submit. The system will auto-route — confirmed directly if within threshold, or sent for approval if it exceeds it.
        </div>
      )}

      {/* Customer counter offers from timeline */}
      {counterOffers.length > 0 && !isViewer && (
        <Card className="mb-4 border-purple-200 bg-purple-50">
          <div className="px-4 py-3">
            <h3 className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-2">Customer Requests</h3>
            <ul className="space-y-2">
              {counterOffers.map((ev) => {
                const meta = ev.metadata as { requested_discount_percent?: number; message_text?: string; line_id?: string };
                return (
                  <li key={ev.id} className="text-sm text-purple-900">
                    <span className="text-xs text-purple-500">{new Date(ev.occurred_at).toLocaleString()} — </span>
                    {meta.message_text && <span>"{meta.message_text}" </span>}
                    {meta.requested_discount_percent != null && (
                      <Badge variant="blue">{meta.requested_discount_percent}% requested</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      )}

      {/* Line items */}
      <Card className="mb-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Product', 'SKU', 'Qty', 'Unit Price', 'Discount %', 'Discounted Total'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isEditable
                ? editLines.map((line, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3 font-medium text-gray-900">{line.productName}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{line.sku}</td>
                    <td className="px-4 py-3">
                      <input type="number" min={1} value={line.quantity}
                        onChange={(e) => updateEditLine(i, 'quantity', Math.max(1, Number(e.target.value)))}
                        className="w-20 px-2 py-1 rounded border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-brand [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                    </td>
                    <td className="px-4 py-3 text-gray-700">${line.unitPrice.toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <input type="number" min={0} max={100} value={line.lineDiscountPercent}
                          onChange={(e) => updateEditLine(i, 'lineDiscountPercent', Number(e.target.value))}
                          className="w-20 px-2 py-1 rounded border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-brand [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
                        <span className="text-gray-500">%</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      ${(line.quantity * line.unitPrice * (1 - line.lineDiscountPercent / 100)).toFixed(2)}
                    </td>
                  </tr>
                ))
                : detail.lines.map((line, i) => (
                  <tr key={line.id ?? i}>
                    <td className="px-4 py-3 font-medium text-gray-900">{line.name ?? line.product_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{line.sku}</td>
                    <td className="px-4 py-3 text-gray-600">{safeNum(line.quantity).toFixed(0)}</td>
                    <td className="px-4 py-3 text-gray-700">${safeNum(line.unit_price).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-700">{safeNum(line.line_discount_percent).toFixed(1)}%</td>
                    <td className="px-4 py-3 font-medium">
                      ${(safeNum(line.quantity) * safeNum(line.unit_price) * (1 - safeNum(line.line_discount_percent) / 100)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              }
              {detail.lines.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">No lines</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Risk + health + total */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {!isViewer && detail.risk && (
          <>
            <span className="text-sm text-gray-600">Blended Risk:</span>
            <RiskBadge risk={risk} />
            <span className="text-xs text-gray-400">{blendedPct}%</span>
          </>
        )}
        {health && (
          <>
            <span className="text-gray-300">|</span>
            <span className="text-sm text-gray-600">Deal Health:</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${bandColor[health.band] ?? 'text-gray-600 bg-gray-100'}`}>
              {health.band} · {safeNum(health.score).toFixed(1)} pts
            </span>
          </>
        )}
        <span className="ml-auto text-sm font-semibold text-gray-900">
          Total: ${isEditable ? editTotal.toFixed(2) : grandTotal.toLocaleString()}
        </span>
      </div>

      {/* Auto-routing info banner for reps */}
      {isEditable && risk !== 'LOW' && (
        <InfoBanner>
          Current discount exceeds threshold — clicking <strong>Update</strong> will auto-route for {risk === 'MEDIUM' ? 'Sales Manager' : 'Sales Manager then Finance'} approval.
        </InfoBanner>
      )}
      {isEditable && risk === 'LOW' && REP_EDITABLE.has(detail.quote.status) && (
        <InfoBanner>
          Discount is within threshold — clicking <strong>Update</strong> will confirm the order directly with no approval needed.
        </InfoBanner>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {/* Action buttons — reps only */}
      {!isViewer && (
        <div className="mt-6 flex gap-3">
          {isEditable ? (
            <>
              <Button variant="secondary" onClick={() => saveRevision(false)} disabled={submitting}>
                {submitting ? 'Saving…' : 'Save Draft'}
              </Button>
              <Button variant="primary" onClick={() => saveRevision(true)} disabled={submitting}>
                {submitting ? 'Updating…' : 'Update'}
              </Button>
            </>
          ) : null}
        </div>
      )}

      {/* Timeline — rep only */}
      {!isViewer && timeline.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowTimeline((v) => !v)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900 mb-3"
          >
            <svg className={`w-4 h-4 transition-transform ${showTimeline ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            Audit Timeline ({timeline.length} events)
          </button>
          {showTimeline && (
            <Card className="p-4">
              <ol className="space-y-3">
                {timeline.map((ev) => (
                  <li key={ev.id} className="flex gap-3">
                    <div className="mt-1.5 w-2 h-2 rounded-full bg-brand-light shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-gray-800 capitalize">{ev.event_type.replace(/[._]/g, ' ')}</p>
                      <p className="text-xs text-gray-400">{new Date(ev.occurred_at).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
