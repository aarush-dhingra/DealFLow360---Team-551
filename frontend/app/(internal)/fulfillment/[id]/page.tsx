'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api, getUser } from '@/lib/api';
import { PageHeader, Badge, Card, Button } from '@/components/ui';

interface Allocation {
  id: string;
  quotationLineId?: string;
  warehouseId?: string;
  quantity?: number | string;
  status?: string;
  productName?: string;
  warehouseName?: string;
}

interface FulfillmentDetail {
  id: string;
  status: string;
  quotationId?: string;
  allocationMode?: string;
  createdAt?: string;
  created_at?: string;
  allocations?: Allocation[];
  lines?: Allocation[];
  items?: Allocation[];
}

interface PlanAllocation {
  quotationLineId: string;
  productId: string;
  warehouseId: string;
  quantity: string;
  status: 'allocated' | 'backordered';
}

interface FulfillmentPlan {
  quotationId: string;
  quoteStatus: string;
  hasBackorder: boolean;
  shipmentCount: number;
  shippingCostTotal: string;
  allocations: PlanAllocation[];
}

const statusVariant = (s: string): 'green' | 'yellow' | 'gray' | 'red' => {
  if (s === 'fulfilled') return 'green';
  if (s === 'partially_fulfilled') return 'yellow';
  if (s === 'pending') return 'gray';
  if (s === 'cancelled') return 'red';
  return 'gray';
};

function groupByWarehouse(allocations: PlanAllocation[]) {
  const map = new Map<string, PlanAllocation[]>();
  for (const a of allocations) {
    if (!map.has(a.warehouseId)) map.set(a.warehouseId, []);
    map.get(a.warehouseId)!.push(a);
  }
  return map;
}

export default function FulfillmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [order, setOrder] = useState<FulfillmentDetail | null>(null);
  const [plan, setPlan] = useState<FulfillmentPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  const [userRoles, setUserRoles] = useState<string[]>([]);

  useEffect(() => {
    setUserRoles(getUser()?.roles ?? []);
  }, []);

  async function loadOrder() {
    const res = await api.get<{ data: FulfillmentDetail }>(`/manager/fulfillment/orders/${id}`);
    return (res as unknown as { data: FulfillmentDetail }).data ?? (res as unknown as FulfillmentDetail);
  }

  useEffect(() => {
    loadOrder()
      .then((detail) => {
        setOrder(detail);
        if (detail.quotationId) {
          setPlanLoading(true);
          api.get<{ data: FulfillmentPlan }>(`/finance/fulfillment/quotations/${detail.quotationId}/plan`)
            .then((r) => setPlan((r as unknown as { data: FulfillmentPlan }).data ?? (r as unknown as FulfillmentPlan)))
            .catch(() => setPlan(null))
            .finally(() => setPlanLoading(false));
        }
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const isFinance = userRoles.includes('finance_operations');

  async function acceptSplit() {
    if (!order?.quotationId) return;
    setActing(true); setActionMsg('');
    try {
      await api.post(`/finance/fulfillment/quotations/${order.quotationId}/allocate`, { mode: 'suggested' });
      setActionMsg('Warehouse split accepted. Order is now in fulfillment.');
      const detail = await loadOrder();
      setOrder(detail);
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActing(false);
    }
  }

  async function consolidate() {
    if (!order?.quotationId) return;
    setActing(true); setActionMsg('');
    try {
      await api.post(`/finance/fulfillment/quotations/${order.quotationId}/consolidate-backorders`, {});
      setActionMsg('Backorders consolidated successfully.');
    } catch (err: unknown) {
      setActionMsg(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setActing(false);
    }
  }

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;
  if (error) return (
    <div className="p-8">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-4">← Back</button>
      <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        Could not load fulfillment order: {error}
      </div>
    </div>
  );
  if (!order) return <div className="p-8 text-gray-500">Order not found.</div>;

  const lines = order.allocations ?? order.lines ?? order.items ?? [];
  const title = order.id.slice(0, 8).toUpperCase();
  const createdDate = order.createdAt ?? order.created_at;
  const isPending = order.status === 'pending';

  const planAllocated = plan?.allocations.filter((a) => a.status === 'allocated') ?? [];
  const planBackordered = plan?.allocations.filter((a) => a.status === 'backordered') ?? [];
  const warehouseGroups = groupByWarehouse(planAllocated);

  return (
    <div className="max-w-3xl">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2">← Back</button>
      <PageHeader
        title={`Fulfillment Order: ${title}`}
        subtitle={order.quotationId ? `Quotation: ${order.quotationId.slice(0, 8)}` : ''}
      />

      <div className="flex items-center gap-3 mb-5">
        <Badge variant={statusVariant(order.status ?? '')}>{(order.status ?? 'unknown').replace(/_/g, ' ')}</Badge>
        {order.allocationMode && <Badge variant="blue">{order.allocationMode} allocation</Badge>}
        {createdDate && <span className="text-sm text-gray-400">Created {new Date(createdDate).toLocaleDateString()}</span>}
      </div>

      {/* Warehouse Split Plan */}
      {order.quotationId && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700">Recommended Warehouse Split</h2>
            {plan && (
              <span className="text-xs text-gray-400">
                {plan.shipmentCount} shipment{plan.shipmentCount !== 1 ? 's' : ''} · est. cost ${parseFloat(plan.shippingCostTotal || '0').toFixed(2)}
              </span>
            )}
          </div>

          {planLoading && <p className="text-sm text-gray-400 mb-3">Loading plan…</p>}

          {!planLoading && plan && plan.allocations.length > 0 && (
            <Card className="mb-3">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {['Warehouse', 'Line ID', 'Qty', 'Status'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {Array.from(warehouseGroups.entries()).map(([whId, rows]) =>
                      rows.map((a, i) => (
                        <tr key={a.quotationLineId + whId}>
                          {i === 0 && (
                            <td className="px-4 py-3 font-medium text-gray-900" rowSpan={rows.length}>
                              {whId.slice(0, 8)}…
                            </td>
                          )}
                          <td className="px-4 py-3 text-xs font-mono text-gray-500">{a.quotationLineId.slice(0, 8)}…</td>
                          <td className="px-4 py-3 text-gray-700">{a.quantity}</td>
                          <td className="px-4 py-3"><Badge variant="green">Allocated</Badge></td>
                        </tr>
                      ))
                    )}
                    {planBackordered.map((a) => (
                      <tr key={a.quotationLineId + 'backorder'}>
                        <td className="px-4 py-3 font-medium text-amber-700">Backorder</td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-500">{a.quotationLineId.slice(0, 8)}…</td>
                        <td className="px-4 py-3 text-amber-600">{a.quantity}</td>
                        <td className="px-4 py-3"><Badge variant="yellow">Backordered</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {!planLoading && !plan && (
            <p className="text-sm text-gray-400 mb-3">No plan available — quote may not be in a fulfillable state.</p>
          )}

          {isFinance && isPending && plan && plan.allocations.length > 0 && (
            <div className="flex gap-3 flex-wrap">
              <Button variant="primary" onClick={acceptSplit} disabled={acting}>
                {acting ? 'Processing…' : 'Accept Suggested Split'}
              </Button>
              <Button variant="secondary" onClick={() => {}} disabled>
                Manual Override
              </Button>
            </div>
          )}

          {isFinance && order.status === 'partially_fulfilled' && (
            <div className="mt-3">
              <div className="mb-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                Stock has arrived. Consolidate remaining backorders to complete fulfillment.
              </div>
              <Button variant="warning" onClick={consolidate} disabled={acting}>
                {acting ? 'Processing…' : 'Consolidate Remaining Backorder'}
              </Button>
            </div>
          )}

          {!isFinance && isPending && plan && (
            <p className="text-xs text-gray-400 mt-1">Finance team can accept or override this split.</p>
          )}

          {actionMsg && (
            <p className={`mt-3 text-sm font-medium ${actionMsg.includes('failed') || actionMsg.toLowerCase().includes('error') ? 'text-red-600' : 'text-emerald-600'}`}>
              {actionMsg}
            </p>
          )}
        </div>
      )}

      {/* Existing allocations */}
      <h2 className="text-sm font-semibold text-gray-700 mb-2">Current Allocations</h2>
      <Card className="mb-5">
        {lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No allocations yet — accept the suggested split above to create them.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Product / Line', 'Warehouse', 'Qty', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line, i) => (
                  <tr key={line.id ?? i}>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500">
                      {line.productName ?? (line.quotationLineId ? line.quotationLineId.slice(0, 8) + '…' : '—')}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {line.warehouseName ?? (line.warehouseId ? line.warehouseId.slice(0, 8) + '…' : '—')}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{line.quantity ?? '—'}</td>
                    <td className="px-4 py-3">
                      {line.status ? <Badge variant={statusVariant(line.status)}>{line.status.replace(/_/g, ' ')}</Badge> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Button variant="secondary" onClick={() => router.back()}>Back to Fulfillment</Button>
    </div>
  );
}
