'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useRoleGuard } from '@/lib/useRoleGuard';
import { PageHeader, Badge, Card, Table, Tr, Td } from '@/components/ui';

interface Invoice {
  id: string;
  invoice_number: string;
  status: string;
  total_amount: string;
  due_date: string | null;
  customer_legal_name: string;
}

type Filter = 'all' | 'unpaid' | 'paid';

export default function InvoicesPage() {
  useRoleGuard(['finance_operations', 'sales_manager', 'admin']);
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    api.get<{ data: Invoice[] }>('/manager/invoices?limit=100')
      .then((res) => setInvoices(res.data ?? []))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  const unpaid = invoices.filter((i) => i.status === 'unpaid' || i.status === 'overdue');
  const paid   = invoices.filter((i) => i.status === 'paid');
  const displayed = filter === 'unpaid' ? unpaid : filter === 'paid' ? paid : invoices;

  return (
    <div>
      <PageHeader title="Invoices" subtitle="Every invoice generated from one-time and recurring orders" />

      <div className="flex items-center gap-3 mb-5">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="all">All ({invoices.length})</option>
          <option value="unpaid">Unpaid ({unpaid.length})</option>
          <option value="paid">Paid ({paid.length})</option>
        </select>
      </div>

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
                {['Invoice #', 'Customer', 'Amount', 'Status', 'Due Date'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && displayed.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => router.push(`/invoices/${inv.id}`)}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-brand">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-gray-900">{inv.customer_legal_name}</td>
                  <td className="px-4 py-3 text-gray-700">${parseFloat(inv.total_amount).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <Badge variant={inv.status === 'paid' ? 'green' : inv.status === 'overdue' ? 'red' : 'yellow'}>
                      {inv.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))}
              {!loading && displayed.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No invoices in this filter</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
