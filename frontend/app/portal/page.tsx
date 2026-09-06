'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, clearToken, getUser } from '@/lib/api';
import { Badge, Button, Card } from '@/components/ui';

type Quote = {
  id: string;
  quote_number: string;
  status: string;
  grand_total: string;
  currency_code: string;
  last_activity_at: string;
  lock_version?: number;
  negotiation_owner_role?: string | null;
  negotiation_handoff_at?: string | null;
};

type Line = { id: string; product_name: string; quantity: string; net_line_value: string };

type Detail = Quote & {
  customer_name: string;
  lock_version: number;
  version?: { lines: Line[]; grand_total: string; currency_code: string };
};

type OfferVersion = {
  version_number: number;
  currency_code: string;
  grand_total: string;
  lines: Array<{ description: string; product_name: string; quantity: string; net_line_value: string }>;
};

type NegotiationRequest = {
  id: string;
  status: string;
  counter_discount_percent: string | null;
  requested_delivery_date: string | null;
  risk_preview_percent: string;
  risk_preview_route: string;
  created_at: string;
  line_requests: Array<{ line_id: string; product_name: string; comment: string }>;
};

type QuoteRequest = { id: string; message: string; status: string; created_at: string };
type TierProgress = {
  tier_code?: string;
  tier_name?: string;
  entitlement_discount_percent: string;
  net_spend: string;
  completed_orders: number;
  tiers: Array<{ code: string; display_name: string; qualification_spend: string; qualification_order_count: number }>;
};

const COMPLETE = new Set(['fulfilled', 'invoiced', 'partially_paid', 'paid']);
const TABS = [
  ['outstanding', 'Outstanding'],
  ['negotiations', 'Negotiations'],
  ['completed', 'Completed'],
  ['requests', 'My Requests'],
] as const;

type Tab = 'outstanding' | 'negotiations' | 'completed' | 'requests';

export default function CustomerPortalHome() {
  const router = useRouter();

  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [initialOffer, setInitialOffer] = useState<OfferVersion | null>(null);
  const [negotiationRequests, setNegotiationRequests] = useState<NegotiationRequest[]>([]);
  const [tier, setTier] = useState<TierProgress | null>(null);
  const [tab, setTab] = useState<Tab>('outstanding');
  const [error, setError] = useState('');

  // Negotiation state
  const [activeLine, setActiveLine] = useState<Line | null>(null);
  const [message, setMessage] = useState('');
  const [discount, setDiscount] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Quote request state
  const [requestMsg, setRequestMsg] = useState('');
  const [myRequests, setMyRequests] = useState<QuoteRequest[]>([]);
  const [requestSending, setRequestSending] = useState(false);
  const [requestDone, setRequestDone] = useState('');

  const loadQuotes = useCallback(() =>
    api.get<{ quotes: Quote[] }>('/portal/quotes')
      .then((r) => {
        setQuotes(r.quotes);
        setSelected((current) => current ? { ...current, ...(r.quotes.find((quote) => quote.id === current.id) ?? {}) } : current);
      })
      .catch((e) => setError(e.message)), []);

  const loadRequests = () =>
    api.get<{ requests: QuoteRequest[] }>('/portal/quote-requests')
      .then((r) => setMyRequests(r.requests))
      .catch(() => {});

  useEffect(() => {
    const user = getUser();
    if (!user?.roles.includes('customer_portal')) { router.replace('/'); return; }
    loadQuotes();
    loadRequests();
    api.get<{ tier: TierProgress }>('/portal/tier')
      .then((r) => setTier(r.tier))
      .catch(() => {});
  }, [router, loadQuotes]);

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') loadQuotes(); };
    const interval = window.setInterval(refresh, 10_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [loadQuotes]);

  const visible = useMemo(() =>
    quotes.filter((q) =>
      tab === 'completed' ? COMPLETE.has(q.status) :
      tab === 'negotiations' ? q.status === 'under_negotiation' :
      !COMPLETE.has(q.status) && q.status !== 'under_negotiation'
    ),
    [quotes, tab]
  );

  async function select(q: Quote) {
    try {
      const [detail, original, requests] = await Promise.all([
        api.get<{ quote: Detail }>(`/portal/quotes/${q.id}`),
        api.get<{ version: OfferVersion }>(`/portal/quotes/${q.id}/versions/1`).catch(() => ({ version: null })),
        api.get<{ requests: NegotiationRequest[] }>(`/portal/quotes/${q.id}/negotiation-requests`).catch(() => ({ requests: [] })),
      ]);
      setSelected(detail.quote);
      setInitialOffer(original.version);
      setNegotiationRequests(requests.requests);
      setMessage('');
      setDiscount('');
      setActiveLine(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not open order.');
    }
  }

  async function submitRequest() {
    if (!selected || (!message.trim() && !discount && !deliveryDate)) return;
    if (message.trim() && !activeLine) {
      setError('Choose the line this comment applies to before submitting your request.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post(`/portal/quotes/${selected.id}/negotiation-requests`, {
        lock_version: selected.lock_version,
        counter_discount_percent: discount ? Number(discount) : null,
        requested_delivery_date: deliveryDate || null,
        line_requests: activeLine && message.trim() ? [{ line_id: activeLine.id, comment: message }] : [],
      });
      await select(selected);
      loadQuotes();
      setActiveLine(null);
      setDeliveryDate('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not send request.');
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmQuotation() {
    if (!selected) return;
    try {
      await api.post(`/portal/quotes/${selected.id}/accept`, { lock_version: selected.lock_version });
      await select(selected);
      loadQuotes();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not confirm order.');
    }
  }

  async function sendQuoteRequest() {
    if (!requestMsg.trim()) return;
    setRequestSending(true);
    setRequestDone('');
    try {
      await api.post('/portal/quote-requests', { message: requestMsg });
      setRequestMsg('');
      setRequestDone('Request sent! A sales rep will reach out with a quotation.');
      loadRequests();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not send request.');
    } finally {
      setRequestSending(false);
    }
  }

  const canNegotiate = selected && !COMPLETE.has(selected.status) &&
    !['rejected', 'cancelled', 'customer_confirmed'].includes(selected.status);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto h-14 px-4 flex items-center gap-3">
          <span className="font-semibold text-gray-900">DealFlow<span className="text-brand">360</span></span>
          <span className="text-sm text-gray-400">Customer portal</span>
          <button
            onClick={() => { clearToken(); router.replace('/'); }}
            className="ml-auto text-sm text-gray-500 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 md:p-8">
        <h1 className="text-2xl font-semibold text-gray-900">Your orders</h1>
        <p className="mt-1 text-sm text-gray-500">Review proposals, negotiate terms, and follow completed orders.</p>

        {error && (
          <p className="mt-4 p-3 bg-red-50 rounded-lg text-sm text-red-700">{error}</p>
        )}

        {/* Tier card */}
        {tier && (
          <Card className="mt-6 p-5">
            <div className="flex justify-between gap-4 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Your tier</p>
                <h2 className="mt-1 text-xl font-semibold capitalize text-gray-900">{tier.tier_name ?? 'No tier'}</h2>
                <p className="text-sm text-gray-500">Discount entitlement: {Number(tier.entitlement_discount_percent).toFixed(0)}%</p>
              </div>
              <div className="text-right text-sm text-gray-600">
                <p>{Number(tier.net_spend).toLocaleString()} completed spend</p>
                <p>{tier.completed_orders} completed orders</p>
              </div>
            </div>
          </Card>
        )}

        {/* Tabs */}
        <div className="mt-6 flex gap-0 border-b">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 text-sm ${tab === key ? 'border-b-2 border-brand text-brand font-medium' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Quote Request tab */}
        {tab === 'requests' ? (
          <div className="mt-5 max-w-2xl space-y-6">
            <Card className="p-5">
              <h2 className="font-semibold text-gray-900 mb-1">Request a Quotation</h2>
              <p className="text-sm text-gray-500 mb-4">Tell us what you need — products, quantities, timeline — and a sales rep will build a quotation for you.</p>
              {requestDone ? (
                <div className="px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">{requestDone}</div>
              ) : (
                <div className="space-y-3">
                  <textarea
                    value={requestMsg}
                    onChange={(e) => setRequestMsg(e.target.value)}
                    placeholder="e.g. We need 10 units of Cloud Storage Pro and 2 onsite setup services for Q4 delivery…"
                    rows={5}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                  />
                  <Button variant="primary" onClick={sendQuoteRequest} disabled={requestSending || !requestMsg.trim()}>
                    {requestSending ? 'Sending…' : 'Submit Request'}
                  </Button>
                </div>
              )}
            </Card>

            {myRequests.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Your previous requests</h3>
                <div className="space-y-2">
                  {myRequests.map((r) => (
                    <Card key={r.id} className="p-4">
                      <div className="flex justify-between gap-3">
                        <p className="text-sm text-gray-700 flex-1">{r.message}</p>
                        <div className="text-right shrink-0">
                          <Badge variant={r.status === 'converted' ? 'green' : r.status === 'viewed' ? 'gray' : 'yellow'}>
                            {r.status}
                          </Badge>
                          <p className="text-xs text-gray-400 mt-1">{new Date(r.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* Quotes list + detail */
          <div className="mt-5 grid lg:grid-cols-2 gap-5">
            {/* Left: quote list */}
            <section className="space-y-3">
              {visible.length === 0 ? (
                <Card className="p-5 text-sm text-gray-500">No {tab} orders.</Card>
              ) : (
                visible.map((q) => (
                  <button key={q.id} onClick={() => select(q)} className="block text-left w-full">
                    <Card className={`p-4 hover:border-brand transition-colors ${selected?.id === q.id ? 'border-brand' : ''}`}>
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-medium text-gray-900">{q.quote_number}</p>
                          <p className="text-sm text-gray-500 mt-1">
                            Last updated {new Date(q.last_activity_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant={q.status === 'under_negotiation' ? 'yellow' : COMPLETE.has(q.status) ? 'green' : 'blue'}>
                            {q.status.replaceAll('_', ' ')}
                          </Badge>
                          <p className="mt-2 text-sm font-medium">{q.currency_code} {Number(q.grand_total).toFixed(2)}</p>
                        </div>
                      </div>
                    </Card>
                  </button>
                ))
              )}
            </section>

            {/* Right: detail + negotiation */}
            <section>
              {selected ? (
                <Card className="p-5">
                  <div className="flex justify-between gap-3 mb-4">
                    <div>
                      <h2 className="font-semibold text-gray-900">{selected.quote_number}</h2>
                      <p className="text-sm text-gray-500">{selected.customer_name}</p>
                    </div>
                    <Badge variant="blue">{selected.status.replaceAll('_', ' ')}</Badge>
                  </div>

                  {/* Line items — click to comment on a specific line */}
                  {selected.version?.lines && selected.version.lines.length > 0 && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">
                        Order lines {canNegotiate && <span className="normal-case text-brand">(click a line to comment on it)</span>}
                      </p>
                      <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
                        {selected.version.lines.map((line) => (
                          <button
                            key={line.id}
                            disabled={!canNegotiate}
                            onClick={() => setActiveLine(activeLine?.id === line.id ? null : line)}
                            className={`w-full text-left flex justify-between items-center px-3 py-2 text-sm transition-colors
                              ${!canNegotiate ? 'cursor-default' : 'hover:bg-brand-50 cursor-pointer'}
                              ${activeLine?.id === line.id ? 'bg-brand-50 ring-1 ring-inset ring-brand' : ''}`}
                          >
                            <span className="text-gray-800">{line.product_name} × {line.quantity}</span>
                            <span className="text-gray-500 shrink-0 ml-4">
                              {selected.version?.currency_code} {Number(line.net_line_value).toFixed(2)}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="flex justify-between text-sm font-medium text-gray-900 px-3 py-2 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                        <span>Total</span>
                        <span>{selected.version.currency_code} {Number(selected.version.grand_total).toFixed(2)}</span>
                      </div>
                    </div>
                  )}

                  {/* Offer and structured negotiation history */}
                  <div className="mb-4">
                    <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Offer &amp; request history</p>
                    <div className="space-y-2">
                      {initialOffer && (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                          <div className="flex justify-between gap-3"><span className="font-medium text-gray-800">Initial offer · v{initialOffer.version_number}</span><span className="font-medium text-gray-800">{initialOffer.currency_code} {Number(initialOffer.grand_total).toFixed(2)}</span></div>
                          <p className="mt-1 text-xs text-gray-500">The original terms sent by your sales representative.</p>
                        </div>
                      )}
                      {initialOffer && selected.version && initialOffer.version_number !== selected.version.version_number && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                          <div className="flex justify-between gap-3"><span className="font-medium text-blue-900">Current offer · v{selected.version.version_number}</span><span className="font-medium text-blue-900">{selected.version.currency_code} {Number(selected.version.grand_total).toFixed(2)}</span></div>
                          <p className="mt-1 text-xs text-blue-700">This is the latest revised offer for your review.</p>
                        </div>
                      )}
                      {negotiationRequests.map((request, index) => (
                        <div key={request.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                          <div className="flex justify-between gap-3"><span className="font-medium text-amber-900">Your request #{index + 1}</span><Badge variant={request.status === 'open' ? 'yellow' : 'gray'}>{request.status}</Badge></div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-amber-900">
                            <span>Counter discount: {request.counter_discount_percent ?? '—'}%</span>
                            <span>Delivery: {request.requested_delivery_date ?? '—'}</span>
                          </div>
                          {request.line_requests.map((line) => <p key={line.line_id} className="mt-2 text-xs text-gray-700"><span className="font-medium">{line.product_name}:</span> {line.comment}</p>)}
                        </div>
                      ))}
                      {negotiationRequests.length === 0 && <p className="text-sm text-gray-400">No change requests submitted yet.</p>}
                    </div>
                  </div>
                  {selected.negotiation_owner_role && (
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                      Your negotiation is currently with <strong>{selected.negotiation_owner_role === 'sales_manager' ? 'a Sales Manager' : selected.negotiation_owner_role === 'finance_operations' ? 'Finance' : 'your Sales Representative'}</strong>.
                      {selected.negotiation_handoff_at && <span className="ml-1 text-xs text-blue-700">Updated {new Date(selected.negotiation_handoff_at).toLocaleString()}.</span>}
                    </div>
                  )}

                  {/* Negotiation form */}
                  {canNegotiate && (
                    <div className="space-y-3 border-t pt-4">
                      {activeLine && (
                        <div className="flex items-center gap-2 text-xs text-brand bg-brand-50 px-3 py-1.5 rounded-lg">
                          <span>Commenting on: <strong>{activeLine.product_name}</strong></span>
                          <button onClick={() => setActiveLine(null)} className="ml-auto text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          {activeLine ? `Request for ${activeLine.product_name}` : 'Line-specific request'}
                        </label>
                        <textarea
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          placeholder={activeLine ? 'Describe the change you need…' : 'Select an order line above first'}
                          disabled={!activeLine}
                          rows={3}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand resize-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Counter discount % (optional)</label>
                        <input
                          value={discount}
                          onChange={(e) => setDiscount(e.target.value)}
                          type="number"
                          min="0"
                          max="100"
                          placeholder="e.g. 15"
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Requested delivery date (optional)</label>
                        <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        <Button variant="secondary" onClick={submitRequest} disabled={submitting || (!message.trim() && !discount && !deliveryDate) || (message.trim() && !activeLine)}>
                          {submitting ? 'Sending…' : 'Submit Request'}
                        </Button>
                        {['sent_to_customer', 'approved'].includes(selected.status) && (
                          <Button variant="primary" onClick={confirmQuotation}>
                            Confirm Quotation
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Confirmed / closed state */}
                  {!canNegotiate && (
                    <div className="border-t pt-4 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-600">
                      <span className="font-medium capitalize">{selected.status.replaceAll('_', ' ')}</span>
                    </div>
                  )}
                </Card>
              ) : (
                <Card className="p-5 text-sm text-gray-500">
                  Select an order to view its details or negotiate.
                </Card>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
