'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { routeToRisk, type BackendApprovalRoute } from '@/lib/data';
import { PageHeader, Badge, RiskBadge, InfoBanner, Button, Card } from '@/components/ui';

interface QuoteLine {
  id: string;
  line_number: number;
  product_name: string;
  sku: string;
  quantity: string;
  unit_price: string;
  line_discount_percent: string;
  line_net_total: string;
  standard_cost: string;
}

interface QuoteDetail {
  quote: {
    id: string;
    quote_number: string;
    status: string;
    lock_version: number;
  };
  version: {
    version_number: number;
    grand_total: string;
    currency_code: string;
    discount_mode: string;
  };
  lines: QuoteLine[];
  risk: {
    blended_risk_percent: string;
    route: BackendApprovalRoute;
  } | null;
  approvals: { id: string; required_role: string; status: string }[];
}

export default function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<{ data: QuoteDetail }>(`/sales-rep/quotations/${id}`)
      .then((res) => setDetail(res.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  async function submitForApproval() {
    setSubmitting(true);
    try {
      await api.post(`/sales-rep/quotations/${id}/submit`);
      router.push('/approvals');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submit failed');
      setSubmitting(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading...</div>;
  if (error && !detail) return <div className="p-8 text-red-500 text-sm">Error: {error}</div>;
  if (!detail) return <div className="p-8 text-gray-500">Quotation not found.</div>;

  const risk = detail.risk ? routeToRisk(detail.risk.route) : 'LOW';
  const blendedPct = detail.risk ? parseFloat(detail.risk.blended_risk_percent).toFixed(1) : '0';

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2">← Back</button>
      <PageHeader
        title={`Quotation ${detail.quote.quote_number}`}
        subtitle={`Version ${detail.version.version_number} - ${detail.version.currency_code}`}
      />

      {/* Line items */}
      <Card className="mb-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Product', 'SKU', 'Qty', 'Unit Price', 'Discount %', 'Net Total'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {detail.lines.map((line) => (
                <tr key={line.id}>
                  <td className="px-4 py-3 font-medium text-gray-900">{line.product_name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{line.sku}</td>
                  <td className="px-4 py-3 text-gray-600">{parseFloat(line.quantity).toFixed(0)}</td>
                  <td className="px-4 py-3 text-gray-700">${parseFloat(line.unit_price).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-700">{parseFloat(line.line_discount_percent).toFixed(1)}%</td>
                  <td className="px-4 py-3 font-medium">${parseFloat(line.line_net_total).toLocaleString()}</td>
                </tr>
              ))}
              {detail.lines.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400 text-sm">No lines - add products below</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Risk + total */}
      <div className="flex items-center gap-4 mb-4">
        <span className="text-sm text-gray-600">Blended Risk:</span>
        <RiskBadge risk={risk} />
        <span className="text-xs text-gray-400">{blendedPct}%</span>
        <span className="ml-auto text-sm font-semibold text-gray-900">
          Total: ${parseFloat(detail.version.grand_total).toLocaleString()}
        </span>
      </div>

      {risk !== 'LOW' && (
        <InfoBanner>
          Discount exceeds thresholds - this quote will be routed for approval ({risk === 'MEDIUM' ? 'Sales Manager' : 'Sales Manager then Finance'}).
        </InfoBanner>
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex gap-3">
        <Button variant="secondary">Save Draft</Button>
        <Button variant="primary" onClick={submitForApproval} disabled={submitting}>
          {submitting ? 'Submitting...' : risk === 'LOW' ? 'Confirm Order' : 'Submit for Approval'}
        </Button>
      </div>
    </div>
  );
}
