'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { invoices } from '@/lib/data';
import { PageHeader, Badge, FilterChip, InfoBanner, Card, Table, Tr, Td } from '@/components/ui';

export default function InvoicesPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'Unpaid' | 'Paid'>('all');

  const unpaid = invoices.filter((i) => i.status === 'Unpaid');
  const paid = invoices.filter((i) => i.status === 'Paid');
  const displayed = filter === 'all' ? invoices : invoices.filter((i) => i.status === filter);

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Every invoice generated from one-time and recurring orders" />

      <div className="flex gap-2 mb-5">
        <FilterChip label="Unpaid" count={unpaid.length} active={filter === 'Unpaid'} onClick={() => setFilter('Unpaid')} color="red" />
        <FilterChip label="Paid" count={paid.length} active={filter === 'Paid'} onClick={() => setFilter('Paid')} color="green" />
        <FilterChip label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
      </div>

      <Card className="mb-4">
        <Table headers={['Invoice #', 'Customer', 'Amount', 'Status', 'Due Date']}>
          {displayed.map((inv) => (
            <Tr key={inv.id} onClick={() => router.push(`/invoices/${inv.id}`)} clickable>
              <Td className="font-medium text-indigo-600">{inv.id}</Td>
              <Td>{inv.customer}</Td>
              <Td>${inv.amount.toLocaleString()}</Td>
              <Td>
                <Badge variant={inv.status === 'Paid' ? 'green' : 'red'}>{inv.status}</Badge>
              </Td>
              <Td className="text-gray-500">{inv.dueDate}</Td>
            </Tr>
          ))}
        </Table>
      </Card>

      <InfoBanner>Click an invoice row to open its full payment and delivery reconciliation detail.</InfoBanner>
    </div>
  );
}
