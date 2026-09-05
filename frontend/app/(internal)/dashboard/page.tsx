'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, getUser } from '@/lib/api';
import { PageHeader, StatCard, Card } from '@/components/ui';

export default function DashboardPage() {
  const [pendingApprovals, setPendingApprovals] = useState<number | null>(null);
  const [openQuotations, setOpenQuotations] = useState<number | null>(null);
  const [atRisk, setAtRisk] = useState<number | null>(null);
  const [pendingInvoices, setPendingInvoices] = useState<number | null>(null);
  const [activity, setActivity] = useState<string[]>([]);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [quotesBreakdown, setQuotesBreakdown] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    const u = getUser();
    const raw = (u as Record<string, unknown> | null)?.roles;
    const roles = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
    setUserRoles(roles);
    setRolesLoaded(true);
  }, []);

  const isAdmin = userRoles.includes('admin');
  const isManager = userRoles.includes('sales_manager') || isAdmin;
  const isFinance = userRoles.includes('finance_operations') && !isAdmin;
  const isSalesRep = userRoles.includes('sales_rep') && !isAdmin && !isManager;

  useEffect(() => {
    if (!rolesLoaded) return;

    if (isManager) {
      api.get<{ approvals: unknown[]; count: number }>('/manager/approvals?status=pending')
        .then((r) => setPendingApprovals(r.count ?? r.approvals?.length ?? 0))
        .catch(() => setPendingApprovals(0));

      api.get<{ quotations: unknown[]; count: number }>('/manager/quotations')
        .then((r) => setOpenQuotations(r.count ?? r.quotations?.length ?? 0))
        .catch(() => setOpenQuotations(0));

      api.get<{ stalled_deals: unknown[]; discount_anomalies: unknown[] }>('/manager/deal-health/dashboard')
        .then((r) => {
          const count = (r.stalled_deals?.length ?? 0) + (r.discount_anomalies?.length ?? 0);
          setAtRisk(count);
          const items: string[] = [];
          if (r.stalled_deals?.length) items.push(`${r.stalled_deals.length} stalled deal(s) flagged by Deal Health`);
          if (r.discount_anomalies?.length) items.push(`${r.discount_anomalies.length} discount anomaly/anomalies detected`);
          setActivity(items);
        })
        .catch(() => setAtRisk(0));
    } else if (isFinance) {
      api.get<{ approvals: unknown[]; count: number }>('/manager/approvals?required_role=finance_operations&status=pending')
        .then((r) => setPendingApprovals(r.count ?? r.approvals?.length ?? 0))
        .catch(() => setPendingApprovals(0));

      api.get<{ invoices: unknown[]; count: number }>('/manager/invoices')
        .then((r) => {
          const all = (r.invoices ?? []) as Array<{ status: string }>;
          const unpaid = all.filter((inv) => ['issued', 'unpaid', 'overdue', 'partially_paid'].includes(inv.status));
          setPendingInvoices(unpaid.length);
        })
        .catch(() => setPendingInvoices(0));
    } else if (isSalesRep) {
      api.get<{ data: Array<{ status: string }> }>('/sales-rep/quotations')
        .then((r) => {
          const breakdown: Record<string, number> = {};
          for (const q of r.data ?? []) {
            breakdown[q.status] = (breakdown[q.status] ?? 0) + 1;
          }
          setQuotesBreakdown(breakdown);
        })
        .catch(() => setQuotesBreakdown({}));
    }
  }, [rolesLoaded, isManager, isFinance, isSalesRep]);

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Central hub — links out to every module below" />

      <div className={`grid gap-4 mb-6 ${isSalesRep ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6' : 'grid-cols-1 sm:grid-cols-3'}`}>
        {isManager && (
          <>
            <Link href="/approvals">
              <StatCard label="Pending Approvals" value={pendingApprovals ?? '…'} sub="quotations waiting for review" />
            </Link>
            <Link href="/quotations">
              <StatCard label="Open Quotations" value={openQuotations ?? '…'} sub="active deals in pipeline" />
            </Link>
            <Link href="/deal-health">
              <StatCard label="At-Risk Deals" value={atRisk ?? '…'} sub="stalled or anomalous discounts" />
            </Link>
          </>
        )}
        {isFinance && (
          <>
            <Link href="/finance/approvals">
              <StatCard label="Pending Finance Sign-offs" value={pendingApprovals ?? '…'} sub="quotes escalated to Finance" />
            </Link>
            <Link href="/invoices">
              <StatCard label="Unpaid Invoices" value={pendingInvoices ?? '…'} sub="awaiting payment or action" />
            </Link>
          </>
        )}
        {isSalesRep && (
          <>
            {[
              { status: 'draft',                      label: 'Draft' },
              { status: 'pending_manager_approval',   label: 'Pending Approval' },
              { status: 'pending_finance_approval',   label: 'Pending Finance' },
              { status: 'approved',                   label: 'Approved' },
              { status: 'returned_for_revision',      label: 'Returned' },
              { status: 'paid',                       label: 'Paid / Done' },
            ].map(({ status, label }) => (
              <Link href="/quotations" key={status}>
                <StatCard
                  label={label}
                  value={quotesBreakdown === null ? '…' : (quotesBreakdown[status] ?? 0)}
                />
              </Link>
            ))}
          </>
        )}
      </div>

      <div className="flex gap-3 mb-6">
        {(isSalesRep || isAdmin) && (
          <Link
            href="/quotations/new"
            className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dim transition-colors"
          >
            + New Quotation
          </Link>
        )}
        {isManager && (
          <Link
            href="/approvals"
            className="px-4 py-2 bg-white text-gray-700 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            View Approvals
          </Link>
        )}
        {isFinance && (
          <>
            <Link
              href="/finance/approvals"
              className="px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-dim transition-colors"
            >
              Finance Approvals
            </Link>
            <Link
              href="/finance/fulfillment"
              className="px-4 py-2 bg-white text-gray-700 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Fulfillment
            </Link>
          </>
        )}
      </div>

      {isManager && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-brand mb-3">Live Alerts</h2>
          {activity.length === 0 ? (
            <p className="text-sm text-gray-400">No active alerts — all deals are healthy.</p>
          ) : (
            <ul className="space-y-2">
              {activity.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-brand-light shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}
