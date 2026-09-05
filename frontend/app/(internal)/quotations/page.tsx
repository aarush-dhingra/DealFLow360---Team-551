'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getUser } from '@/lib/api';

import { routeToRisk, type BackendApprovalRoute } from '@/lib/data';
import { PageHeader, Badge, RiskBadge, Button, Card } from '@/components/ui';

interface QuoteRow {
  id: string;
  quote_number: string;
  status: string;
  legal_name: string;
  grand_total: string;
  blended_risk_percent: string | null;
  route: BackendApprovalRoute | null;
  owner_user_id: string;
}

const STATUS_DISPLAY: Record<string, string> = {
  draft: 'Draft',
  pending_manager_approval: 'Pending Approval',
  pending_finance_approval: 'Pending Finance',
  approved: 'Approved',
  returned_for_revision: 'Returned',
  rejected: 'Rejected',
  negotiation: 'Negotiation',
  paid: 'Paid / Done',
  cancelled: 'Cancelled',
};

const STATUS_VARIANT: Record<string, 'gray' | 'yellow' | 'green' | 'blue' | 'red'> = {
  draft: 'gray',
  pending_manager_approval: 'yellow',
  pending_finance_approval: 'yellow',
  approved: 'green',
  returned_for_revision: 'red',
  rejected: 'red',
  confirmed: 'green',
  negotiation: 'blue',
};

const KANBAN_COLS = ['draft', 'pending_manager_approval', 'pending_finance_approval', 'approved', 'paid'];

export default function QuotationsPage() {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  useEffect(() => {
    const roles = getUser()?.roles ?? [];
    setUserRoles(roles);
    setRolesLoaded(true);
  }, []);

  const isManager = userRoles.includes('sales_manager') || userRoles.includes('admin');
  const isFinance = userRoles.includes('finance_operations') && !isManager;

  useEffect(() => {
    if (!rolesLoaded) return;
    const useManagerEndpoint = isManager || isFinance;
    const endpoint = useManagerEndpoint ? '/manager/quotations' : '/sales-rep/quotations';
    api.get<{ data?: QuoteRow[]; quotations?: QuoteRow[] }>(endpoint)
      .then((res) => {
        const list = res.data ?? res.quotations ?? [];
        if (isManager) {
          // managers don't see finance_direct quotes (those go straight to finance, bypassing manager)
          setQuotes(list.filter((q) => q.route !== 'finance_direct'));
        } else if (isFinance) {
          // finance sees only quotes that involve them (finance_direct or manager_then_finance routes)
          setQuotes(list.filter((q) => q.route === 'finance_direct' || q.route === 'manager_then_finance'));
        } else {
          setQuotes(list);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [rolesLoaded, isManager, isFinance]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Quotations" subtitle="Every quotation in the system - click a row to open it" />
        <div className="flex items-center gap-2">
          {(userRoles.includes('sales_rep') || userRoles.includes('admin')) && (
            <Button variant="primary" onClick={() => router.push('/quotations/new')}>+ New Quotation</Button>
          )}
          <Button variant="secondary" onClick={() => setView((v) => (v === 'kanban' ? 'table' : 'kanban'))}>
            {view === 'kanban' ? 'Table View' : 'Kanban View'}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Could not reach backend: {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400 text-sm">Loading...</div>
      ) : view === 'kanban' ? (
        <KanbanView quotes={quotes} onOpen={(id) => router.push(`/quotations/${id}`)} />
      ) : (
        <TableView quotes={quotes} onOpen={(id) => router.push(`/quotations/${id}`)} />
      )}
    </div>
  );
}

const ALLOWED_DRAGS: Record<string, string> = {
  'draft': 'pending_manager_approval',
};

function KanbanView({ quotes: initialQuotes, onOpen }: { quotes: QuoteRow[]; onOpen: (id: string) => void }) {
  const [quotes, setQuotes] = useState(initialQuotes);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const dragSourceStatus = useRef<string | null>(null);

  useEffect(() => { setQuotes(initialQuotes); }, [initialQuotes]);

  async function handleDrop(targetStatus: string) {
    setDragOver(null);
    if (!dragId || dragSourceStatus.current === targetStatus) return;
    const sourceStatus = dragSourceStatus.current ?? '';
    if (ALLOWED_DRAGS[sourceStatus] !== targetStatus) return;
    setMoving(dragId);
    try {
      await api.post(`/sales-rep/quotations/${dragId}/submit`, {});
      setQuotes((qs) => qs.map((q) => q.id === dragId ? { ...q, status: targetStatus } : q));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Could not move quote');
    } finally {
      setMoving(null);
      setDragId(null);
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {KANBAN_COLS.map((status) => {
        const cards = quotes.filter((q) => q.status === status);
        const isDropTarget = dragId !== null && ALLOWED_DRAGS[dragSourceStatus.current ?? ''] === status;
        return (
          <div
            key={status}
            className={`min-w-[200px] w-52 shrink-0 rounded-xl transition-colors ${isDropTarget && dragOver === status ? 'bg-brand-50 ring-2 ring-brand ring-offset-1' : ''}`}
            onDragOver={(e) => { if (isDropTarget) { e.preventDefault(); setDragOver(status); } }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => handleDrop(status)}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {STATUS_DISPLAY[status] ?? status}
              </h3>
              <span className="text-xs text-gray-400">{cards.length}</span>
            </div>
            <div className="space-y-2">
              {cards.map((q) => (
                <Card
                  key={q.id}
                  className={`p-3 cursor-pointer hover:shadow-md hover:border-brand-100 transition-all select-none ${moving === q.id ? 'opacity-40' : ''} ${dragId === q.id ? 'opacity-60 ring-1 ring-brand' : ''}`}
                  onClick={() => { if (!dragId) onOpen(q.id); }}
                >
                  <div
                    draggable
                    onDragStart={() => { setDragId(q.id); dragSourceStatus.current = q.status; }}
                    onDragEnd={() => { setDragId(null); dragSourceStatus.current = null; setDragOver(null); }}
                    className="w-full"
                  >
                    <p className="text-sm font-medium text-gray-900">{q.legal_name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      ${q.grand_total ? parseFloat(q.grand_total).toLocaleString() : '-'}
                    </p>
                    {q.route && q.route !== 'none' && (
                      <div className="mt-1.5">
                        <RiskBadge risk={routeToRisk(q.route)} />
                      </div>
                    )}
                  </div>
                </Card>
              ))}
              {cards.length === 0 && (
                <div className={`h-20 rounded-xl border-2 border-dashed flex items-center justify-center transition-colors ${isDropTarget && dragOver === status ? 'border-brand bg-brand-50' : 'border-gray-200'}`}>
                  <span className="text-xs text-gray-300">
                    {isDropTarget && dragOver === status ? 'Drop to submit' : 'Empty'}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TableView({ quotes, onOpen }: { quotes: QuoteRow[]; onOpen: (id: string) => void }) {
  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Quote #', 'Customer', 'Amount', 'Status', 'Risk'].map((h) => (
                <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {quotes.map((q) => (
              <tr key={q.id} onClick={() => onOpen(q.id)} className="cursor-pointer hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-brand">{q.quote_number}</td>
                <td className="px-4 py-3 text-gray-900">{q.legal_name}</td>
                <td className="px-4 py-3 text-gray-700">
                  ${q.grand_total ? parseFloat(q.grand_total).toLocaleString() : '-'}
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[q.status] ?? 'gray'}>{STATUS_DISPLAY[q.status] ?? q.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  {q.route ? <RiskBadge risk={routeToRisk(q.route)} /> : <span className="text-gray-300">-</span>}
                </td>
              </tr>
            ))}
            {quotes.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No quotations yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
