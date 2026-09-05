'use client';

import { PageHeader, StatCard, Button, Card } from '@/components/ui';

export default function ReportsPage() {
  return (
    <div>
      <PageHeader title="Admin / Reporting Dashboard" subtitle="Sales trends, approval bottlenecks and platform usage" />

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Period', placeholder: 'This month' },
            { label: 'Sales Team', placeholder: 'All teams' },
            { label: 'Approval Status', placeholder: 'All statuses' },
            { label: 'Product', placeholder: 'All products' },
          ].map((f) => (
            <div key={f.label}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
              <select className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300">
                <option>{f.placeholder}</option>
              </select>
            </div>
          ))}
        </div>
      </Card>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Quotes Created" value={148} sub="148 this month" />
        <StatCard label="Avg Approval Time" value="6.4 hrs" sub="Down 12% vs last month" />
        <StatCard label="Top Upsold Product" value="Care Plan 2yr" sub="34 added to quotes" />
      </div>

      {/* Export */}
      <div className="flex gap-3">
        <Button variant="secondary">Export PDF</Button>
        <Button variant="secondary">Export XLS</Button>
      </div>
    </div>
  );
}
