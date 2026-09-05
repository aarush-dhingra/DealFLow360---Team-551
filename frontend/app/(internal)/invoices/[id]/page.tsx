'use client';

import { useParams, useRouter } from 'next/navigation';
import { invoices } from '@/lib/data';
import { PageHeader, Badge, InfoBanner, Button, Card, PipelineStep, Table, Tr, Td } from '@/components/ui';

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const inv = invoices.find((i) => i.id === id);
  const related = invoices.filter((i) => i.customer === inv?.customer);

  if (!inv) return <div className="p-8 text-gray-500">Invoice not found.</div>;

  const pipelineStep = inv.status === 'Paid' ? 3 : 2;

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2">← Back</button>
      <PageHeader
        title={`Invoice Detail: ${inv.id} (${inv.customer})`}
        subtitle="Opened by clicking a row on the Invoices list"
      />

      {/* Pipeline */}
      <div className="mb-6">
        <PipelineStep steps={['Order Confirmed', 'Shipped', 'Invoiced', 'Paid']} current={pipelineStep} />
      </div>

      {/* Related invoices table */}
      <Card className="mb-5">
        <Table headers={['Invoice #', 'Amount', 'Status', 'Due Date']}>
          {related.map((r) => (
            <Tr key={r.id}>
              <Td className="font-medium">{r.id}{r.id.includes('43') ? ' (Recurring)' : ''}</Td>
              <Td>${r.amount.toLocaleString()}</Td>
              <Td><Badge variant={r.status === 'Paid' ? 'green' : 'red'}>{r.status}</Badge></Td>
              <Td className="text-gray-500">{r.dueDate}</Td>
            </Tr>
          ))}
        </Table>
      </Card>

      <InfoBanner>Partial invoicing stays reconciled with partial delivery - nothing is billed before it ships.</InfoBanner>

      <div className="mt-5 flex gap-3">
        <Button variant="primary">Record Payment</Button>
        <Button variant="secondary">Download Summary</Button>
      </div>
    </div>
  );
}
