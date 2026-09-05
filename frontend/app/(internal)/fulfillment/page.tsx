'use client';

import { useRouter } from 'next/navigation';
import { fulfillmentOrders, warehouseStock } from '@/lib/data';
import { PageHeader, Badge, InfoBanner, Card, Table, Tr, Td } from '@/components/ui';

export default function FulfillmentPage() {
  const router = useRouter();

  return (
    <div>
      <PageHeader title="Fulfillment and Stock" subtitle="Live stock per warehouse, plus every order that still needs fulfilling" />

      {/* Stock table */}
      <Card className="mb-6">
        <Table headers={['Warehouse', 'Product', 'In Stock', 'Reserved', 'Available']}>
          {warehouseStock.map((row, i) => (
            <Tr key={i}>
              <Td className="font-medium">{row.warehouse}</Td>
              <Td>{row.product}</Td>
              <Td>{row.inStock}</Td>
              <Td>{row.reserved}</Td>
              <Td className={row.available < 5 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
                {row.available}
              </Td>
            </Tr>
          ))}
        </Table>
      </Card>

      {/* Orders awaiting fulfillment */}
      <h2 className="text-sm font-semibold text-indigo-600 mb-3">Orders Awaiting Fulfillment</h2>
      <Card className="mb-4">
        <Table headers={['Order', 'Customer', 'Status', 'Warehouses']}>
          {fulfillmentOrders.map((order) => (
            <Tr
              key={order.id}
              onClick={() => router.push(`/fulfillment/${order.id}`)}
              clickable
            >
              <Td className="font-medium text-indigo-600">{order.id}</Td>
              <Td>{order.customer}</Td>
              <Td>
                <Badge variant={order.status === 'Split Pending' ? 'yellow' : 'red'}>{order.status}</Badge>
              </Td>
              <Td className="text-gray-500">{order.warehouses}</Td>
            </Tr>
          ))}
        </Table>
      </Card>

      <InfoBanner>Click an order row to open its warehouse split detail.</InfoBanner>
    </div>
  );
}
