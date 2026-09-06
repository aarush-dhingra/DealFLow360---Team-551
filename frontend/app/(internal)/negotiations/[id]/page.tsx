'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useLiveUpdates } from '@/lib/useLiveUpdates';
import { Badge, Button, Card, PageHeader } from '@/components/ui';

type Line = { product_id: string; product_name: string; sku: string; quantity: string; line_discount_percent: string; allowed_discount_percent: string };
type Request = { id: string; status: string; counter_discount_percent: string | null; requested_delivery_date: string | null; customer_name: string; line_requests: Array<{ line_id: string; comment: string }> };
type Detail = { case: { owner_role: string; status: string; last_handoff_reason: string | null }; quotation: { quote_number: string; customer_name: string; customer_tier: string | null; owner_name?: string | null; lock_version: number; version: { currency_code: string; grand_total: string; version_number: number; lines: Line[] } }; requests: Request[]; events: Array<{ id: string; event_type: string; actor_name: string; from_role: string | null; to_role: string | null; reason: string | null; created_at: string }>; can_edit: boolean };

const roleLabel = (role: string) => role === 'sales_manager' ? 'Sales Manager' : role === 'finance_operations' ? 'Finance' : 'Sales Representative';
const eventLabel = (event: string) => ({ revised_offer_sent: 'Revised offer sent', forwarded_to_finance: 'Forwarded to Finance', customer_confirmed: 'Customer confirmed' }[event] ?? event.replaceAll('_', ' '));

export default function NegotiationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(() => api.get<Detail>(`/negotiations/${id}`).then((result) => { setDetail(result); setLines(result.quotation.version.lines); setError(''); }).catch((err) => setError(err.message)), [id]);
  useEffect(() => { load(); }, [load]);
  useLiveUpdates(load);

  async function send() {
    if (!detail) return;
    setSaving(true);
    try {
      await api.post(`/negotiations/${id}/revisions`, { expectedLockVersion: detail.quotation.lock_version, currencyCode: detail.quotation.version.currency_code, discountMode: 'line', reason: 'Negotiated revision', lines: lines.map((line) => ({ productId: line.product_id, quantity: Number(line.quantity), lineDiscountPercent: Number(line.line_discount_percent) })) });
      await load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Could not send the revised offer.'); } finally { setSaving(false); }
  }
  async function forward() {
    if (reason.trim().length < 3) { setError('Give Finance a concise handoff reason.'); return; }
    setSaving(true);
    try { await api.post(`/negotiations/${id}/forward-to-finance`, { reason }); router.push('/negotiations'); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Could not forward the negotiation.'); } finally { setSaving(false); }
  }

  if (!detail) return <div className="p-8 text-sm text-gray-500">Loading negotiation…</div>;
  const isManager = detail.case.owner_role === 'sales_manager';
  return <div className="max-w-6xl">
    <button onClick={() => router.back()} className="mb-3 text-sm text-gray-500 hover:text-gray-700">← Back to queue</button>
    <PageHeader title={`Negotiation · ${detail.quotation.customer_name}`} subtitle={`${detail.quotation.quote_number} · ${detail.quotation.customer_tier ? `${detail.quotation.customer_tier} tier` : 'No tier'}`} />
    {error && <p className="my-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <Card className="mt-4 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Current owner</p><p className="mt-1 font-semibold text-gray-900">{roleLabel(detail.case.owner_role)}</p></div><Badge variant={detail.can_edit ? 'yellow' : 'gray'}>{detail.can_edit ? 'Your action' : `With ${roleLabel(detail.case.owner_role)}`}</Badge></div><div className="mt-3 grid gap-2 border-t border-gray-100 pt-3 text-sm text-gray-600 sm:grid-cols-2"><p>Assigned sales rep: <span className="font-medium text-gray-800">{detail.quotation.owner_name ?? 'Removed internal user'}</span></p><p>{detail.case.last_handoff_reason ? `Latest handoff: ${detail.case.last_handoff_reason}` : 'No escalation handoff yet.'}</p></div></Card>
    <div className="mt-5 grid gap-5 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2"><div className="flex items-start justify-between gap-4"><div><h2 className="font-semibold text-gray-900">Current offer · v{detail.quotation.version.version_number}</h2><p className="mt-1 text-sm text-gray-500">Adjust only the commercial terms you are authorised to offer.</p></div><p className="text-sm font-semibold text-gray-900">{detail.quotation.version.currency_code} {Number(detail.quotation.version.grand_total).toFixed(2)}</p></div><div className="mt-4 overflow-x-auto rounded-lg border border-gray-200"><table className="w-full min-w-[580px] text-sm"><thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-3 py-2 text-left">Line</th><th className="px-3 py-2 text-left">Allowed</th><th className="px-3 py-2 text-left">Quantity</th><th className="px-3 py-2 text-left">Discount</th></tr></thead><tbody className="divide-y divide-gray-100">{lines.map((line, index) => <tr key={line.product_id}><td className="px-3 py-3"><p className="font-medium text-gray-900">{line.product_name}</p><p className="text-xs text-gray-400">{line.sku}</p></td><td className="px-3 py-3 text-gray-600">{Number(line.allowed_discount_percent).toFixed(1)}%</td><td className="px-3 py-3"><label className="sr-only">Quantity for {line.product_name}</label><input aria-label={`Quantity for ${line.product_name}`} disabled={!detail.can_edit} type="number" min="1" value={line.quantity} onChange={(event) => setLines((value) => value.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} className="w-20 rounded border border-gray-300 p-2 disabled:bg-gray-50" /></td><td className="px-3 py-3"><label className="sr-only">Discount for {line.product_name}</label><div className="flex items-center gap-1"><input aria-label={`Discount for ${line.product_name}`} disabled={!detail.can_edit} type="number" min="0" max="100" value={line.line_discount_percent} onChange={(event) => setLines((value) => value.map((item, i) => i === index ? { ...item, line_discount_percent: event.target.value } : item))} className="w-20 rounded border border-gray-300 p-2 disabled:bg-gray-50" /><span className="text-gray-500">%</span></div></td></tr>)}</tbody></table></div>{detail.can_edit && <div className="mt-5 flex flex-wrap gap-2"><Button onClick={send} disabled={saving}>{saving ? 'Sending…' : 'Send revised offer'}</Button>{isManager && <><label className="sr-only" htmlFor="finance-reason">Reason to involve Finance</label><input id="finance-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why Finance needs to continue this negotiation" className="min-w-[230px] flex-1 rounded-lg border border-gray-300 px-3 text-sm" /><Button variant="secondary" onClick={forward} disabled={saving}>Forward to Finance</Button></>}</div>}{!detail.can_edit && <p className="mt-5 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">This handoff is read-only for you. The active owner has the next action.</p>}</Card>
      <div className="space-y-4"><Card className="p-4"><h2 className="text-sm font-semibold text-gray-900">Customer requests</h2>{detail.requests.length === 0 ? <p className="mt-3 text-sm text-gray-500">No structured request yet.</p> : detail.requests.map((request) => <div key={request.id} className="mt-3 border-t border-gray-100 pt-3 text-sm"><div className="flex justify-between gap-2"><span className="font-medium text-gray-800">{request.customer_name}</span><Badge variant={request.status === 'open' ? 'yellow' : 'gray'}>{request.status}</Badge></div><p className="mt-1 text-xs text-gray-500">Discount: {request.counter_discount_percent ?? '—'}% · Delivery: {request.requested_delivery_date ?? '—'}</p>{request.line_requests.map((line, index) => <p key={`${line.line_id}-${index}`} className="mt-2 text-xs text-gray-700">{line.comment}</p>)}</div>)}</Card><Card className="p-4"><h2 className="text-sm font-semibold text-gray-900">Handoff history</h2>{detail.events.length === 0 ? <p className="mt-3 text-sm text-gray-500">No handoffs yet.</p> : detail.events.map((event) => <div key={event.id} className="mt-3 border-t border-gray-100 pt-3 text-xs text-gray-600"><p><span className="font-medium text-gray-800">{eventLabel(event.event_type)}</span>{event.from_role && event.to_role ? ` · ${roleLabel(event.from_role)} → ${roleLabel(event.to_role)}` : ''}</p><p className="mt-1">{event.actor_name} · {new Date(event.created_at).toLocaleString()}</p>{event.reason && <p className="mt-1 text-gray-500">{event.reason}</p>}</div>)}</Card></div>
    </div>
  </div>;
}
