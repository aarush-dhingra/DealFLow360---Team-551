'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { PageHeader, Button, Card, Badge } from '@/components/ui';

interface Customer {
  id: string;
  legal_name: string;
  tier_code: string;
  entitlement_discount_percent: number;
}
interface Product {
  id: string;
  name: string;
  sku: string;
  list_price: number;
  unit_name: string;
  category_code: string;
  discount_ceiling_percent: number;
}
interface Line {
  productId: string;
  productName: string;
  listPrice: number;
  quantity: number;
  lineDiscountPercent: number;
  maxDiscountPercent: number;
}
interface UpsellSuggestion {
  id: string;
  name: string;
  sku: string;
  list_price: number;
  unit_name: string;
  discount_ceiling_percent: number;
  margin_percent: string | null;
  promotion_tag: string | null;
  rule_kind: string;
}

export default function NewQuotationPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [suggestions, setSuggestions] = useState<UpsellSuggestion[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    api.get<{ data: Customer[] }>('/sales-rep/quotations/meta/customers')
      .then((r) => setCustomers(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
    api.get<{ data: Product[] }>('/sales-rep/quotations/meta/products')
      .then((r) => setProducts(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (lines.length === 0) { setSuggestions([]); return; }
    const ids = lines.map((l) => l.productId).join(',');
    api.get<{ data: UpsellSuggestion[] }>(`/sales-rep/quotations/meta/upsell-suggestions?productIds=${ids}`)
      .then((r) => setSuggestions(Array.isArray(r.data) ? r.data : []))
      .catch(() => setSuggestions([]));
  }, [lines.map((l) => l.productId).join(',')]);

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  function addProduct(productId: string) {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    if (lines.some((l) => l.productId === p.id)) return;
    const customerEntitlement = selectedCustomer?.entitlement_discount_percent ?? 100;
    const maxDiscount = Math.min(customerEntitlement, Number(p.discount_ceiling_percent));
    setLines((prev) => [
      ...prev,
      { productId: p.id, productName: p.name, listPrice: Number(p.list_price), quantity: 1, lineDiscountPercent: 0, maxDiscountPercent: maxDiscount },
    ]);
  }

  function addSuggestion(s: UpsellSuggestion) {
    const customerEntitlement = selectedCustomer?.entitlement_discount_percent ?? 100;
    const maxDiscount = Math.min(customerEntitlement, Number(s.discount_ceiling_percent));
    setLines((prev) => [
      ...prev,
      { productId: s.id, productName: s.name, listPrice: Number(s.list_price), quantity: 1, lineDiscountPercent: 0, maxDiscountPercent: maxDiscount },
    ]);
    setDismissed((prev) => new Set([...prev, s.id]));
  }

  function updateLine(i: number, field: 'quantity' | 'lineDiscountPercent', val: number) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  const total = lines.reduce((sum, l) => sum + l.quantity * l.listPrice * (1 - l.lineDiscountPercent / 100), 0);
  const needsApproval = lines.some((l) => l.lineDiscountPercent > l.maxDiscountPercent);

  const visibleSuggestions = suggestions.filter(
    (s) => !dismissed.has(s.id) && !lines.some((l) => l.productId === s.id)
  );

  async function save(andSubmit = false) {
    if (!customerId) { setError('Select a customer first.'); return; }
    if (lines.length === 0) { setError('Add at least one product.'); return; }
    setSaving(true); setError('');
    try {
      const body = {
        customerId,
        discountMode: 'line',
        currencyCode: 'USD',
        reason: 'Initial quotation',
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, lineDiscountPercent: l.lineDiscountPercent })),
      };
      const res = await api.post<{ data: { quote: { id: string } } }>('/sales-rep/quotations', body);
      const quoteId = res.data.quote.id;
      if (andSubmit) {
        await api.post(`/sales-rep/quotations/${quoteId}/submit`, {});
      }
      router.push('/quotations');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save quotation');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2">← Back</button>
      <PageHeader title="New Quotation" subtitle="Pick a customer, add products and discounts, then save or submit." />

      <div className="grid grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Customer <span className="text-red-500">*</span></label>
          <select
            value={customerId}
            onChange={(e) => { setCustomerId(e.target.value); setLines([]); }}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">Select customer…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.legal_name}</option>)}
          </select>
          {selectedCustomer && (
            <p className="mt-1.5 text-xs text-gray-500">
              <Badge variant="gray">{selectedCustomer.tier_code}</Badge>
              <span className="ml-2">tier · entitlement up to <strong>{selectedCustomer.entitlement_discount_percent}%</strong> discount</span>
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Add Product</label>
          <select
            onChange={(e) => { addProduct(e.target.value); e.target.value = ''; }}
            disabled={!customerId}
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
          >
            <option value="">{customerId ? 'Select product to add…' : 'Select a customer first'}</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} — ${p.list_price}</option>)}
          </select>
        </div>
      </div>

      {lines.length > 0 && (
        <Card className="mb-5">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Product', 'Qty', 'List Price', 'List Total', 'Discount %', 'Discounted Total', ''].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line, i) => {
                  const overThreshold = line.lineDiscountPercent > line.maxDiscountPercent;
                  return (
                    <tr key={i}>
                      <td className="px-4 py-3 font-medium text-gray-900">{line.productName}</td>
                      <td className="px-4 py-3">
                        <input type="number" min={1} value={line.quantity}
                          onChange={(e) => updateLine(i, 'quantity', Math.max(1, Number(e.target.value)))}
                          className="w-16 px-2 py-1 rounded border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-brand" />
                      </td>
                      <td className="px-4 py-3 text-gray-600">${line.listPrice.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-500">${(line.quantity * line.listPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <input type="number" min={0} max={100} value={line.lineDiscountPercent}
                            onChange={(e) => updateLine(i, 'lineDiscountPercent', Number(e.target.value))}
                            className={`w-20 px-2 py-1 rounded border text-sm focus:outline-none focus:ring-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${overThreshold ? 'border-amber-400 focus:ring-amber-400' : 'border-gray-300 focus:ring-brand'}`} />
                          <span className="text-gray-500">%</span>
                        </div>
                        <p className={`text-xs mt-0.5 ${overThreshold ? 'text-amber-600 font-medium' : 'text-gray-400'}`}>
                          max {line.maxDiscountPercent}%{overThreshold ? ' — approval required' : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        ${(line.quantity * line.listPrice * (1 - line.lineDiscountPercent / 100)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => removeLine(i)} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Upsell & Cross-sell Suggestions */}
      {visibleSuggestions.length > 0 && (
        <div className="mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Upsell and Cross-Sell Suggestions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleSuggestions.map((s) => {
              const marginDelta = s.margin_percent ? `+${parseFloat(s.margin_percent).toFixed(1)}% margin` : null;
              return (
                <Card key={s.id} className="p-4 border-brand-100">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{s.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{s.sku} · ${Number(s.list_price).toLocaleString()}</p>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {marginDelta && <Badge variant="green">{marginDelta}</Badge>}
                        {s.promotion_tag && <Badge variant="blue">{s.promotion_tag}</Badge>}
                        <Badge variant="gray">{s.rule_kind === 'cross_sell' ? 'Cross-sell' : 'Upsell'}</Badge>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        onClick={() => addSuggestion(s)}
                        className="px-3 py-1.5 bg-brand text-white text-xs font-medium rounded-lg hover:bg-brand-dim transition-colors whitespace-nowrap"
                      >
                        + Add to Quote
                      </button>
                      <button
                        onClick={() => setDismissed((prev) => new Set([...prev, s.id]))}
                        className="px-3 py-1.5 text-gray-400 text-xs hover:text-gray-600 transition-colors text-center"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {lines.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-gray-900">Total: ${total.toFixed(2)}</p>
          {needsApproval && (
            <span className="text-xs text-amber-600 font-medium">Discount exceeds threshold — will route for approval</span>
          )}
        </div>
      )}

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => save(false)} disabled={saving}>
          {saving ? 'Saving…' : 'Save Draft'}
        </Button>
        <Button variant="primary" onClick={() => save(true)} disabled={saving}>
          {saving ? 'Saving…' : 'Submit'}
        </Button>
      </div>
    </div>
  );
}
