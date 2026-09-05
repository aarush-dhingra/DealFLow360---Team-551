'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRoleGuard } from '@/lib/useRoleGuard';
import { PageHeader, Badge, Card, Button } from '@/components/ui';

interface OrderLine {
  id: string;
  product_name?: string;
  quantity?: number;
  fulfilled_quantity?: number;
  warehouse_name?: string;
  status?: string;
}

interface FulfillmentDetail {
  id: string;
  fulfillment_order_number?: string;
  status: string;
  customer_legal_name?: string;
  customer_name?: string;
  created_at?: string;
  lines?: OrderLine[];
  items?: OrderLine[];
  quotation_id?: string;
}

export default function FulfillmentDetailPage() {
  useRoleGuard(['sales_manager', 'admin']);

  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<FulfillmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<FulfillmentDetail | { order: FulfillmentDetail }>(`/manager/fulfillment/orders/${id}`)
      .then((res) => {
        const detail = 'order' in res ? res.order : res;
        setOrder(detail as FulfillmentDetail);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

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

  const lines = order.lines ?? order.items ?? [];
  const title = order.fulfillment_order_number ?? order.id;
  const customer = order.customer_legal_name ?? order.customer_name ?? '—';

  const statusVariant = (s: string) => {
    if (s === 'fulfilled') return 'green';
    if (s === 'partially_fulfilled') return 'yellow';
    if (s === 'pending') return 'gray';
    if (s === 'cancelled') return 'red';
    return 'gray';
  };

  return (
    <div className="max-w-3xl">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2">← Back</button>
      <PageHeader
        title={`Fulfillment: ${title}`}
        subtitle={customer}
      />

      <div className="flex items-center gap-3 mb-5">
        <Badge variant={statusVariant(order.status)}>{order.status.replace(/_/g, ' ')}</Badge>
        {order.created_at && (
          <span className="text-sm text-gray-400">Created {new Date(order.created_at).toLocaleDateString()}</span>
        )}
      </div>

      <Card className="mb-5">
        {lines.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No line items on this order.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Product', 'Warehouse', 'Qty', 'Fulfilled', 'Status'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-3 text-gray-900">{line.product_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{line.warehouse_name ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{line.quantity ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{line.fulfilled_quantity ?? 0}</td>
                    <td className="px-4 py-3">
                      {line.status ? (
                        <Badge variant={statusVariant(line.status)}>{line.status.replace(/_/g, ' ')}</Badge>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => router.back()}>Back to Fulfillment</Button>
      </div>
    </div>
  );
}
