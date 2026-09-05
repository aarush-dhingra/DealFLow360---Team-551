'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRoleGuard } from '@/lib/useRoleGuard';
import { PageHeader, Badge, Button, Card, Table, Tr, Td, InfoBanner } from '@/components/ui';

interface Quote {
  id: string;
  quote_number: string;
  status: string;
  legal_name: string;
  grand_total: string;
}

interface Allocation {
  quotationLineId: string;
  warehouseId: string;
  status: 'allocated' | 'backordered';
  quantity: string;
  productName?: string;
  warehouseName?: string;
}

interface FulfillmentPlan {
  quotationId: string;
  quoteStatus: string;
  lineCount: number;
  hasBackorder: boolean;
  shipmentCount: number;
  shippingCostTotal: string;
  allocations: Allocation[];
}

export default function FinanceFulfillmentPage() {
  useRoleGuard(['finance_operations', 'admin']);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [plan, setPlan] = useState<FulfillmentPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [actionResult, setActionResult] = useState<Record<string, string>>({});

  useEffect(() => {
    Promise.all([
      api.get<{ quotations: Quote[] }>('/manager/quotations?status=approved'),
      api.get<{ quotations: Quote[] }>('/manager/quotations?status=in_fulfillment').catch(() => ({ quotations: [] })),
    ])
      .then(([approved, inflight]) => {
        setQuotes([...(approved.quotations ?? []), ...(inflight.quotations ?? [])]);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function selectQuote(quoteId: string) {
    if (selected === quoteId) { setSelected(null); setPlan(null); return; }
    setSelected(quoteId);
    setPlan(null);
    setPlanLoading(true);
    try {
      const res = await api.get<{ data: FulfillmentPlan }>(`/finance/fulfillment/quotations/${quoteId}/plan`);
      setPlan(res.data);
    } catch (err: unknown) {
      setActionResult((r) => ({ ...r, [quoteId]: err instanceof Error ? err.message : 'Plan load failed' }));
    } finally {
      setPlanLoading(false);
    }
  }

  async function allocate(quoteId: string) {
    setActing(true);
    try {
      await api.post(`/finance/fulfillment/quotations/${quoteId}/allocate`, { mode: 'suggested' });
      setActionResult((r) => ({ ...r, [quoteId]: 'Allocated successfully.' }));
      setPlan(null);
      setSelected(null);
      setQuotes((qs) => qs.map((q) => q.id === quoteId ? { ...q, status: 'in_fulfillment' } : q));
    } catch (err: unknown) {
      setActionResult((r) => ({ ...r, [quoteId]: err instanceof Error ? err.message : 'Allocation failed' }));
    } finally {
      setActing(false);
    }
  }

  async function consolidate(quoteId: string) {
    setActing(true);
    try {
      const res = await api.post<{ data: { consolidatedRows: number; remainingBackorders: number } }>(
        `/finance/fulfillment/quotations/${quoteId}/consolidate-backorders`
      );
      const d = res.data;
      setActionResult((r) => ({ ...r, [quoteId]: `Consolidated ${d.consolidatedRows} rows. ${d.remainingBackorders} backorders remain.` }));
    } catch (err: unknown) {
      setActionResult((r) => ({ ...r, [quoteId]: err instanceof Error ? err.message : 'Consolidation failed' }));
    } finally {
      setActing(false);
    }
  }

  return (
    <div>
      <PageHeader title="Fulfillment" subtitle="Allocate approved quotes to warehouse stock" />

      {error && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Could not reach backend: {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">No quotes awaiting fulfillment.</div>
      ) : (
        <Card>
          <Table headers={['Quote', 'Customer', 'Total', 'Status', '']}>
            {quotes.map((q) => (
              <>
                <Tr key={q.id} onClick={() => selectQuote(q.id)} clickable>
                  <Td className="font-medium text-brand">{q.quote_number}</Td>
                  <Td>{q.legal_name}</Td>
                  <Td>${q.grand_total ? parseFloat(q.grand_total).toLocaleString() : '-'}</Td>
                  <Td>
                    <Badge variant={q.status === 'approved' ? 'blue' : 'yellow'}>
                      {q.status.replace(/_/g, ' ')}
                    </Badge>
                  </Td>
                  <Td>
                    <span className="text-xs text-brand">{selected === q.id ? 'Hide plan ▲' : 'View plan ▼'}</span>
                  </Td>
                </Tr>

                {selected === q.id && (
                  <tr key={`${q.id}-plan`}>
                    <td colSpan={5} className="px-4 py-4 bg-brand-50 border-b border-gray-100">
                      {planLoading && <p className="text-sm text-gray-400">Loading fulfillment plan...</p>}

                      {actionResult[q.id] && (
                        <p className="text-sm text-emerald-700 mb-3">{actionResult[q.id]}</p>
                      )}

                      {plan && plan.quotationId === q.id && (
                        <div className="space-y-3">
                          <div className="flex gap-4 text-sm text-gray-700">
                            <span><strong>{plan.lineCount}</strong> lines</span>
                            <span><strong>{plan.shipmentCount}</strong> shipments</span>
                            <span>Shipping cost: <strong>${parseFloat(plan.shippingCostTotal || '0').toLocaleString()}</strong></span>
                            {plan.hasBackorder && <Badge variant="orange">Has Backorders</Badge>}
                          </div>

                          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                <tr>
                                  {['Line ID', 'Warehouse', 'Qty', 'Status'].map((h) => (
                                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {plan.allocations.map((alloc, i) => (
                                  <tr key={i}>
                                    <td className="px-3 py-2 text-xs text-gray-500 font-mono">{alloc.quotationLineId.slice(0, 8)}...</td>
                                    <td className="px-3 py-2 text-gray-700">{alloc.warehouseName ?? alloc.warehouseId.slice(0, 8)}</td>
                                    <td className="px-3 py-2">{alloc.quantity}</td>
                                    <td className="px-3 py-2">
                                      <Badge variant={alloc.status === 'allocated' ? 'green' : 'orange'}>{alloc.status}</Badge>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <div className="flex gap-2 pt-1">
                            {q.status === 'approved' && (
                              <Button variant="primary" onClick={() => allocate(q.id)} disabled={acting}>
                                Allocate (Suggested)
                              </Button>
                            )}
                            {q.status === 'in_fulfillment' && (
                              <Button variant="secondary" onClick={() => consolidate(q.id)} disabled={acting}>
                                Consolidate Backorders
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </>
            ))}
          </Table>
        </Card>
      )}

      <div className="mt-4">
        <InfoBanner>
          Allocate uses the system suggested warehouse split. Manual overrides are available via API. Backorder consolidation re-attempts allocation against current stock.
        </InfoBanner>
      </div>
    </div>
  );
}
