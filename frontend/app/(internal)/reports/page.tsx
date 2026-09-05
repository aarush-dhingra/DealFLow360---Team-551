'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useRoleGuard } from '@/lib/useRoleGuard';
import { PageHeader, StatCard, Card, Button } from '@/components/ui';

interface ReportSummary {
  quotesCreated: number;
  quotedValue: string | number;
  averageApprovalHours: string | number;
  pendingApprovalCount: number;
}

const PERIOD_LABELS: Record<string, string> = {
  '': 'All time',
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
};

export default function ReportsPage() {
  useRoleGuard(['sales_manager', 'admin', 'finance_operations']);
  const [data, setData] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('');

  function buildQuery() {
    const now = new Date();
    if (period === 'this_month') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      return `?from=${from}`;
    }
    if (period === 'last_month') {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const to = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      return `?from=${from}&to=${to}`;
    }
    if (period === 'this_quarter') {
      const q = Math.floor(now.getMonth() / 3);
      const from = new Date(now.getFullYear(), q * 3, 1).toISOString();
      return `?from=${from}`;
    }
    return '';
  }

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get<{ data: ReportSummary }>(`/manager/reports${buildQuery()}`)
      .then((r) => setData(r.data))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [period]);

  const hoursNum = data ? parseFloat(String(data.averageApprovalHours)) : 0;
  const hours = data ? hoursNum.toFixed(1) : '…';
  const valueNum = data ? parseFloat(String(data.quotedValue)) : 0;
  const value = data ? `$${valueNum.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '…';

  function exportCsv() {
    if (!data) return;
    const periodLabel = PERIOD_LABELS[period] ?? period;
    const rows = [
      ['Metric', 'Value', 'Period'],
      ['Quotes Created', String(data.quotesCreated), periodLabel],
      ['Pipeline Value (USD)', valueNum.toFixed(2), periodLabel],
      ['Avg Approval Time (hrs)', hoursNum.toFixed(2), periodLabel],
      ['Pending Approvals', String(data.pendingApprovalCount), periodLabel],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dealflow360-report-${period || 'all-time'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPdf() {
    window.print();
  }

  return (
    <div>
      <PageHeader title="Reporting Dashboard" subtitle="Sales trends, approval bottlenecks and pipeline value" />

      <Card className="p-4 mb-6">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Period</label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">All time</option>
              <option value="this_month">This month</option>
              <option value="last_month">Last month</option>
              <option value="this_quarter">This quarter</option>
            </select>
          </div>
        </div>
      </Card>

      {error && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Could not reach backend: {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Quotes Created" value={loading ? '…' : data?.quotesCreated ?? 0} sub="total quotations in period" />
        <StatCard label="Pipeline Value" value={loading ? '…' : value} sub="sum of quoted amounts" />
        <StatCard label="Avg Approval Time" value={loading ? '…' : `${hours} hrs`} sub="mean time to decision" />
        <StatCard label="Pending Approvals" value={loading ? '…' : data?.pendingApprovalCount ?? 0} sub="awaiting manager or finance" />
      </div>

      <div className="flex gap-3 print:hidden">
        <Button variant="secondary" onClick={exportPdf} disabled={loading || !data}>Export PDF</Button>
        <Button variant="secondary" onClick={exportCsv} disabled={loading || !data}>Export XLS</Button>
      </div>

      {/* Print-only summary table */}
      <div className="hidden print:block mt-8">
        <h2 className="text-lg font-semibold mb-4">DealFlow360 — Sales Report ({PERIOD_LABELS[period] ?? period})</h2>
        <table className="w-full border-collapse border border-gray-300 text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2 text-left">Metric</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Value</th>
            </tr>
          </thead>
          <tbody>
            <tr><td className="border border-gray-300 px-4 py-2">Quotes Created</td><td className="border border-gray-300 px-4 py-2">{data?.quotesCreated ?? 0}</td></tr>
            <tr><td className="border border-gray-300 px-4 py-2">Pipeline Value (USD)</td><td className="border border-gray-300 px-4 py-2">{value}</td></tr>
            <tr><td className="border border-gray-300 px-4 py-2">Avg Approval Time</td><td className="border border-gray-300 px-4 py-2">{hours} hrs</td></tr>
            <tr><td className="border border-gray-300 px-4 py-2">Pending Approvals</td><td className="border border-gray-300 px-4 py-2">{data?.pendingApprovalCount ?? 0}</td></tr>
          </tbody>
        </table>
        <p className="mt-4 text-xs text-gray-500">Exported from DealFlow360 on {new Date().toLocaleDateString()}</p>
      </div>
    </div>
  );
}
