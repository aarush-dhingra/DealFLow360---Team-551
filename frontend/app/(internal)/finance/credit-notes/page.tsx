'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useRoleGuard } from '@/lib/useRoleGuard';
import { PageHeader, Card, Button } from '@/components/ui';

type Tab = 'issue' | 'apply';

export default function FinanceCreditNotesPage() {
  useRoleGuard(['finance_operations', 'admin']);
  const [tab, setTab] = useState<Tab>('issue');

  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [creditNoteId, setCreditNoteId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  function reset() {
    setInvoiceId(''); setAmount(''); setReason('');
    setCreditNoteId(''); setResult(''); setError('');
  }

  async function handleIssue(e: React.FormEvent) {
    e.preventDefault();
    if (!invoiceId.trim() || !amount.trim() || !reason.trim()) return;
    setLoading(true); setError(''); setResult('');
    try {
      const res = await api.post<{ creditNote?: { id: string; credit_note_number?: string } }>(
        `/finance/invoices/${invoiceId.trim()}/credit-notes`,
        { amount: amount.trim(), reason: reason.trim() }
      );
      const cn = res.creditNote;
      setResult(`Credit note issued${cn?.credit_note_number ? ` (${cn.credit_note_number})` : ''}.`);
      reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Issue failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleApply(e: React.FormEvent) {
    e.preventDefault();
    if (!creditNoteId.trim()) return;
    setLoading(true); setError(''); setResult('');
    try {
      await api.post(`/finance/credit-notes/${creditNoteId.trim()}/apply`);
      setResult('Credit note applied successfully.');
      reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <PageHeader title="Credit Notes" subtitle="Issue credit notes against invoices or apply an existing credit note" />

      <div className="flex rounded-lg bg-gray-100 p-1 mb-6 w-fit">
        {(['issue', 'apply'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); reset(); }}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'issue' ? 'Issue Credit Note' : 'Apply Credit Note'}
          </button>
        ))}
      </div>

      {result && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
          {result}
        </div>
      )}

      {tab === 'issue' && (
        <Card className="p-5">
          <form onSubmit={handleIssue} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Invoice ID <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                value={invoiceId}
                onChange={(e) => setInvoiceId(e.target.value)}
                placeholder="UUID of the invoice to credit"
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
                placeholder="e.g. 250.00"
                pattern="^\d+(\.\d+)?$"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Reason <span className="text-red-500">*</span></label>
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for the credit (e.g. damaged goods, billing error)"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'Issuing...' : 'Issue Credit Note'}
            </Button>
          </form>
        </Card>
      )}

      {tab === 'apply' && (
        <Card className="p-5">
          <form onSubmit={handleApply} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Credit Note ID <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                value={creditNoteId}
                onChange={(e) => setCreditNoteId(e.target.value)}
                placeholder="UUID of the credit note to apply"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'Applying...' : 'Apply Credit Note'}
            </Button>
          </form>
        </Card>
      )}

    </div>
  );
}
