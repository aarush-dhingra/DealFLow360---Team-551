'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { PageHeader, Badge, InfoBanner, Button, Card, PipelineStep, Table, Tr, Td } from '@/components/ui';

interface Payment {
  id: string;
  amount: string;
  paymentMethod: string;
  externalReference: string | null;
  paidAt: string;
}

interface CreditNote {
  id: string;
  amount: string;
  appliedAmount: string;
  status: string;
  reason: string | null;
  createdAt: string;
}

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  quotationId: string;
  quoteNumber: string;
  customerName: string;
  currencyCode: string;
  amountDue: string;
  amountPaid: string;
  status: string;
  dueAt: string | null;
  issuedAt: string | null;
  createdAt: string;
  appliedCreditTotal: string;
  payments: Payment[];
  creditNotes: CreditNote[];
}

function pipelineStep(status: string): number {
  if (['paid', 'credited'].includes(status)) return 3;
  if (['issued', 'unpaid', 'overdue', 'partially_paid'].includes(status)) return 2;
  return 1;
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [inv, setInv] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ data: InvoiceDetail }>(`/manager/invoices/${id}`)
      .then((res) => setInv(res.data))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-8 text-gray-400 text-sm">Loading...</div>;
  if (error) return (
    <div className="p-8">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-4">← Back</button>
      <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">Error: {error}</div>
    </div>
  );
  if (!inv) return <div className="p-8 text-gray-500">Invoice not found.</div>;

  const step = pipelineStep(inv.status);
  const isPaid = ['paid', 'credited'].includes(inv.status);
  const outstanding = parseFloat(inv.amountDue) - parseFloat(inv.amountPaid || '0') - parseFloat(inv.appliedCreditTotal || '0');

  return (
    <div className="max-w-4xl">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2">← Back</button>
      <PageHeader
        title={`Invoice: ${inv.invoiceNumber} (${inv.customerName})`}
        subtitle={inv.quoteNumber ? `Quotation ${inv.quoteNumber}` : ''}
      />

      <div className="mb-6">
        <PipelineStep steps={['Order Confirmed', 'Shipped', 'Invoiced', 'Paid']} current={step} />
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        <Badge variant={isPaid ? 'green' : inv.status === 'overdue' ? 'red' : 'yellow'}>
          {inv.status.replace(/_/g, ' ')}
        </Badge>
        <Badge variant="gray">{inv.currencyCode}</Badge>
        {inv.dueAt && (
          <Badge variant={!isPaid && new Date(inv.dueAt) < new Date() ? 'red' : 'gray'}>
            Due {new Date(inv.dueAt).toLocaleDateString()}
          </Badge>
        )}
      </div>

      <Card className="mb-5">
        <Table headers={['Field', 'Value']}>
          <Tr><Td>Amount Due</Td><Td className="font-semibold">${parseFloat(inv.amountDue).toLocaleString()}</Td></Tr>
          <Tr><Td>Amount Paid</Td><Td className="text-emerald-700">${parseFloat(inv.amountPaid || '0').toLocaleString()}</Td></Tr>
          {parseFloat(inv.appliedCreditTotal || '0') > 0 && (
            <Tr><Td>Credits Applied</Td><Td className="text-blue-700">${parseFloat(inv.appliedCreditTotal).toLocaleString()}</Td></Tr>
          )}
          <Tr>
            <Td>Outstanding</Td>
            <Td className={outstanding > 0 ? 'font-semibold text-red-600' : 'font-semibold text-emerald-700'}>
              ${Math.max(0, outstanding).toLocaleString()}
            </Td>
          </Tr>
        </Table>
      </Card>

      {inv.payments.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Payments</h2>
          <Card className="mb-5">
            <Table headers={['Amount', 'Method', 'Reference', 'Date']}>
              {inv.payments.map((p) => (
                <Tr key={p.id}>
                  <Td className="font-medium text-emerald-700">${parseFloat(p.amount).toLocaleString()}</Td>
                  <Td className="capitalize">{p.paymentMethod?.replace(/_/g, ' ') ?? '-'}</Td>
                  <Td className="text-gray-500 text-xs font-mono">{p.externalReference ?? '-'}</Td>
                  <Td className="text-gray-400">{new Date(p.paidAt).toLocaleDateString()}</Td>
                </Tr>
              ))}
            </Table>
          </Card>
        </>
      )}

      {inv.creditNotes.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Credit Notes</h2>
          <Card className="mb-5">
            <Table headers={['Amount', 'Applied', 'Status', 'Reason', 'Date']}>
              {inv.creditNotes.map((cn) => (
                <Tr key={cn.id}>
                  <Td>${parseFloat(cn.amount).toLocaleString()}</Td>
                  <Td className="text-blue-700">${parseFloat(cn.appliedAmount || '0').toLocaleString()}</Td>
                  <Td><Badge variant={cn.status === 'applied' ? 'green' : 'gray'}>{cn.status}</Badge></Td>
                  <Td className="text-gray-500">{cn.reason ?? '-'}</Td>
                  <Td className="text-gray-400">{new Date(cn.createdAt).toLocaleDateString()}</Td>
                </Tr>
              ))}
            </Table>
          </Card>
        </>
      )}

      <InfoBanner>Partial invoicing stays reconciled with partial delivery — nothing is billed before it ships.</InfoBanner>

      <div className="mt-5 flex gap-3">
        <Button variant="primary" onClick={() => router.push(`/finance/payments`)}>Record Payment</Button>
        <Button variant="secondary" onClick={() => router.push(`/finance/credit-notes`)}>Issue Credit Note</Button>
      </div>
    </div>
  );
}
