'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useLiveUpdates } from '@/lib/useLiveUpdates';
import { Badge, Card, PageHeader } from '@/components/ui';

type CaseRow = { quotation_id:string; quote_number:string; customer_name:string; owner_name:string; owner_role:string; case_status:string; quote_status:string; grand_total:string; currency_code:string; last_handoff_reason:string|null; updated_at:string };
const ownerLabel: Record<string,string> = { sales_rep:'Sales Rep', sales_manager:'Manager', finance_operations:'Finance' };

export default function NegotiationsPage() {
  const router = useRouter(); const [cases,setCases]=useState<CaseRow[]>([]); const [error,setError]=useState(''); const [loading,setLoading]=useState(true);
  const load = useCallback(() => {
    api.get<{cases:CaseRow[]}>('/negotiations').then(r => { setCases(r.cases); setError(''); }).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveUpdates(load);
  return <div><PageHeader title="Negotiation queue" subtitle="Customer requests assigned to your role, with every handoff preserved." />
    {error&&<p className="mb-4 p-3 rounded bg-red-50 text-red-700 text-sm">{error}</p>}
    {loading ? <div className="py-12 text-center text-sm text-gray-400">Loading negotiation queue…</div> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{cases.map(item=><Card key={item.quotation_id} className="p-4 cursor-pointer hover:border-brand hover:shadow-sm" onClick={()=>router.push(`/negotiations/${item.quotation_id}`)}><div className="flex justify-between gap-2"><div><p className="font-semibold text-gray-900">{item.customer_name}</p><p className="text-xs text-gray-500 mt-1">{item.quote_number}</p></div><Badge variant={item.owner_role==='finance_operations'?'blue':item.owner_role==='sales_manager'?'yellow':'gray'}>{ownerLabel[item.owner_role]}</Badge></div><p className="mt-3 text-sm text-gray-700">{item.currency_code} {Number(item.grand_total).toFixed(2)}</p><div className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-500"><p>Assigned sales rep: <span className="font-medium text-gray-700">{item.owner_name}</span></p><p className="mt-1">{item.owner_role === 'finance_operations' && item.last_handoff_reason ? `Forwarded to Finance: ${item.last_handoff_reason}` : item.last_handoff_reason ? `Handoff: ${item.last_handoff_reason}` : 'Open negotiation'}</p></div><p className="mt-2 text-xs text-gray-400">Updated {new Date(item.updated_at).toLocaleString()}</p></Card>)}{cases.length===0&&!error&&<Card className="p-6 text-sm text-gray-500">No negotiation is currently assigned to you.</Card>}</div>}
  </div>;
}
