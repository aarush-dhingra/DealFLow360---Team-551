'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRoleGuard } from '@/lib/useRoleGuard';
import { PageHeader, Badge, Card } from '@/components/ui';

interface FulfillmentOrder {
  id: string;
  status: string;
  quotationId?: string;
  quoteNumber?: string;
  customerName?: string;
  // snake_case fallbacks
  customer_legal_name?: string;
  customer_name?: string;
  createdAt?: string;
  created_at?: string;
}

export default function FulfillmentPage() {
  useRoleGuard(['sales_manager', 'admin']);

  const router = useRouter();
  const [orders, setOrders] = useState<FulfillmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ data?: { orders?: FulfillmentOrder[] } | FulfillmentOrder[]; orders?: FulfillmentOrder[] } | FulfillmentOrder[]>('/manager/fulfillment/orders')
      .then((res: unknown) => {
        const r = res as Record<string, unknown>;
        const data = r.data as Record<string, unknown> | FulfillmentOrder[] | undefined;
        const list: FulfillmentOrder[] = Array.isArray(res) ? res as FulfillmentOrder[]
          : Array.isArray(data) ? data
          : Array.isArray((data as Record<string, unknown>)?.orders) ? (data as Record<string, unknown>).orders as FulfillmentOrder[]
          : Array.isArray(r.orders) ? r.orders as FulfillmentOrder[]
          : [];
        setOrders(list);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const statusVariant = (s: string) => {
    if (s === 'fulfilled') return 'green';
    if (s === 'partially_fulfilled') return 'yellow';
    if (s === 'pending') return 'gray';
    if (s === 'cancelled') return 'red';
    return 'gray';
  };

  return (
    <div>
      <PageHeader title="Fulfillment" subtitle="Fulfillment orders for approved deals" />

      {error && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Could not reach backend: {error}
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Order #', 'Customer', 'Status', 'Created'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && orders.map((order) => (
                <tr
                  key={order.id}
                  onClick={() => router.push(`/fulfillment/${order.id}`)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-brand">
                    {order.quoteNumber ?? order.id.slice(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {order.customerName ?? order.customer_legal_name ?? order.customer_name ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={statusVariant(order.status)}>{order.status.replace(/_/g, ' ')}</Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {(order.createdAt ?? order.created_at)
                      ? new Date((order.createdAt ?? order.created_at)!).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              ))}
              {!loading && orders.length === 0 && !error && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No fulfillment orders found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
