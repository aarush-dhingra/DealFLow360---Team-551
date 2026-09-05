'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useRoleGuard } from '@/lib/useRoleGuard';
import { PageHeader, Card, Button } from '@/components/ui';

type Tab = 'pay' | 'void';

export default function FinancePaymentsPage() {
  useRoleGuard(['finance_operations', 'admin']);
  const [tab, setTab] = useState<Tab>('pay');

  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('bank_transfer');
  const [externalRef, setExternalRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  function reset() { setInvoiceId(''); setAmount(''); setExternalRef(''); setResult(''); setError(''); }

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceId.trim() || !amount.trim()) return;
    setLoading(true); setError(''); setResult('');
    try {
      await api.post(`/finance/invoices/${invoiceId.trim()}/payments`, {
        amount: amount.trim(),
        method,
        ...(externalRef.trim() ? { externalReference: externalRef.trim() } : {}),
      });
      setResult(`Payment of $${amount} recorded successfully.`);
      reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleVoid(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceId.trim()) return;
    setLoading(true); setError(''); setResult('');
    try {
      await api.post(`/finance/invoices/${invoiceId.trim()}/void`);
      setResult('Invoice voided successfully.');
      reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Void failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader title="Payments" subtitle="Record payments against invoices or void unpaid invoices" />

      <div className="flex rounded-lg bg-gray-100 p-1 mb-6 w-fit">
        {(['pay', 'void'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); reset(); }}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${
              tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'pay' ? 'Record Payment' : 'Void Invoice'}
          </button>
        ))}
      </div>

      {result && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          {result}
        </div>
      )}

      {tab === 'pay' && (
        <Card className="p-5">
          <form onSubmit={handlePay} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Invoice ID <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                placeholder="UUID from the invoice"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 1500.00"
                pattern="^\d+(\.\d+)?$"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Payment Method <span className="text-red-500">*</span></label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              >
                <option value="bank_transfer">Bank Transfer</option>
                <option value="card">Card</option>
                <option value="cheque">Cheque</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">External Reference <span className="text-gray-400">(optional)</span></label>
              <input
                type="text"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                placeholder="Bank ref, cheque number..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'Recording...' : 'Record Payment'}
            </Button>
          </form>
        </Card>
      )}

      {tab === 'void' && (
        <Card className="p-5">
          <form onSubmit={handleVoid} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Invoice ID <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                placeholder="UUID of the unpaid invoice to void"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="pt-1">
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                Voiding is irreversible. Only unpaid invoices can be voided.
              </p>
              <Button type="submit" variant="danger" disabled={loading}>
                {loading ? 'Voiding...' : 'Void Invoice'}
              </Button>
            </div>
          </form>
        </Card>
      )}

    </div>
  );
}
