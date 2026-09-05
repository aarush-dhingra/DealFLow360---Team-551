'use client';

import { useParams, useRouter } from 'next/navigation';
import { fulfillmentOrders } from '@/lib/data';
import { PageHeader, InfoBanner, Button, Card, Table, Tr, Td } from '@/components/ui';

export default function FulfillmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const order = fulfillmentOrders.find((o) => o.id === id);

  if (!order) return <div className="p-8 text-gray-500">Order not found.</div>;

  return (
    <div className="max-w-3xl">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2">← Back</button>
      <PageHeader
        title={`Fulfillment Detail: ${order.id} (${order.customer})`}
        subtitle="Opened by clicking an order row on the Fulfillment list"
      />

      <Card className="mb-5">
        <Table headers={['Warehouse', 'Qty Fulfilled', 'Est. Shipments', 'Cost']}>
          {order.split.map((row, i) => (
            <Tr key={i}>
              <Td className="font-medium">{row.warehouse}</Td>
              <Td>{row.qtyFulfilled} units</Td>
              <Td>{row.shipments}</Td>
              <Td>${row.cost}</Td>
            </Tr>
          ))}
        </Table>
      </Card>

      <InfoBanner>
        "Consolidate Remaining Backorder" prompt appears automatically once East Depot restocks.
      </InfoBanner>

      <div className="mt-5 flex gap-3">
        <Button variant="primary" onClick={() => router.push('/subscriptions')}>
          Accept Suggested Split
        </Button>
        <Button variant="secondary">Manual Override</Button>
      </div>
    </div>
  );
}
