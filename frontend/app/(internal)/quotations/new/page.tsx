'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { products, quotations } from '@/lib/data';
import { PageHeader, Button, Card, InfoBanner, RiskBadge } from '@/components/ui';
import { computeBlendedRisk, QuotationLine } from '@/lib/data';

const CUSTOMERS = ['Acme Corp', 'Beta Industries', 'Nova Retail', 'Zenith Co', 'Delta LLC'];
const TIERS = ['Bronze', 'Silver', 'Gold'] as const;

export default function NewQuotationPage() {
  const router = useRouter();
  const [customer, setCustomer] = useState('');
  const [tier, setTier] = useState<'Bronze' | 'Silver' | 'Gold'>('Gold');
  const [lines, setLines] = useState<QuotationLine[]>([]);

  const tierLimit = { Bronze: 5, Silver: 10, Gold: 15 };
  const categoryLimit = { Hardware: 15, Services: 10, Subscription: 5 };

  function addProduct(productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    const limit = Math.min(tierLimit[tier], categoryLimit[p.category as keyof typeof categoryLimit]);
    setLines((prev) => [
      ...prev,
      { product: p.name, qty: 1, price: p.price, discount: 0, limit, category: p.category as QuotationLine['category'], status: 'OK' },
    ]);
  }

  function updateDiscount(i: number, val: number) {
    setLines((prev) =>
      prev.map((line, idx) =>
        idx === i
          ? {
              ...line,
              discount: val,
              status: val > line.limit ? `OVER (+${val - line.limit}pt)` : 'OK',
            }
          : line
      )
    );
  }

  const { risk, pointsOver } = computeBlendedRisk(lines);

  const total = lines.reduce((sum, l) => sum + l.qty * l.price * (1 - l.discount / 100), 0);

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2">← Back</button>
      <PageHeader title="New Quotation" subtitle="Pick products, apply discounts, and submit for approval if needed." />

      {/* Customer */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Customer</label>
          <select
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">Select customer…</option>
            {CUSTOMERS.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Customer Tier</label>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as typeof tier)}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            {TIERS.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Add product */}
      <div className="mb-5">
        <label className="block text-xs font-medium text-gray-500 mb-1">Add Product</label>
        <select
          onChange={(e) => { addProduct(e.target.value); e.target.value = ''; }}
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">Select product to add…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name} - ${p.price}</option>)}
        </select>
      </div>

      {/* Lines */}
      {lines.length > 0 && (
        <Card className="mb-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Product', 'Qty', 'Price', 'Discount %', 'Limit %', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line, i) => (
                  <tr key={i} className={line.status !== 'OK' ? 'bg-red-50' : ''}>
                    <td className="px-4 py-3 text-gray-900 font-medium">{line.product}</td>
                    <td className="px-4 py-3 text-gray-600">{line.qty}</td>
                    <td className="px-4 py-3">${line.price}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={line.discount}
                        onChange={(e) => updateDiscount(i, Number(e.target.value))}
                        className="w-16 px-2 py-1 rounded border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                      />
                      <span className="ml-1 text-gray-500">%</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{line.limit}%</td>
                    <td className="px-4 py-3">
                      {line.status === 'OK' ? (
                        <span className="text-emerald-600 text-xs font-medium">OK</span>
                      ) : (
                        <span className="text-red-600 text-xs font-medium">{line.status}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Risk + total */}
      {lines.length > 0 && (
        <div className="flex items-center gap-4 mb-4">
          <span className="text-sm text-gray-600">Blended Risk: <RiskBadge risk={risk} /></span>
          <span className="text-sm font-semibold text-gray-900">Total: ${total.toFixed(2)}</span>
        </div>
      )}

      {risk !== 'LOW' && lines.length > 0 && (
        <InfoBanner>
          Discount exceeds thresholds - this quote will be automatically routed for approval ({risk === 'MEDIUM' ? 'Sales Manager' : 'Sales Manager then Finance'}).
        </InfoBanner>
      )}

      <div className="mt-5 flex gap-3">
        <Button variant="secondary">Save Draft</Button>
        <Button variant="primary" onClick={() => router.push('/quotations')}>
          {risk === 'LOW' ? 'Confirm Order' : 'Submit for Approval'}
        </Button>
      </div>
    </div>
  );
}
