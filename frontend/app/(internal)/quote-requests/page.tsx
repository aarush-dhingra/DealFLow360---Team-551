'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useLiveUpdates } from '@/lib/useLiveUpdates';
import { PageHeader, Badge, Button, Card, Table, Tr, Td } from '@/components/ui';

interface QuoteRequest {
  id: string;
  customer_id: string;
  message: string;
  status: 'pending' | 'viewed' | 'converted';
  created_at: string;
  contact_name: string;
  contact_email: string;
  customer_name: string;
  quotation_id?: string | null;
  quote_number?: string | null;
}

const STATUS_VARIANT: Record<string, 'yellow' | 'green' | 'gray'> = {
  pending: 'yellow',
  viewed: 'gray',
  converted: 'green',
};

export default function QuoteRequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<QuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get<{ requests: QuoteRequest[] }>('/sales-rep/quotations/requests')
      .then((r) => setRequests(r.requests))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  useLiveUpdates(load);

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Quote Requests"
        subtitle="Your assigned customer requests. Build and send the quotation before any manager or finance escalation."
      />

      {error && (
        <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">Loading...</div>
      ) : requests.length === 0 ? (
        <div className="text-sm text-gray-400 py-12 text-center">No quote requests yet.</div>
      ) : (
        <Card>
          <Table headers={['Customer', 'Contact', 'Message', 'Status', 'Received', 'Action']}>
            {requests.map((r) => (
              <Tr key={r.id}>
                <Td className="font-medium">{r.customer_name}</Td>
                <Td>
                  <div>{r.contact_name}</div>
                  <div className="text-xs text-gray-400">{r.contact_email}</div>
                </Td>
                <Td className="max-w-xs">
                  <p className="text-sm text-gray-700 line-clamp-2">{r.message}</p>
                </Td>
                <Td>
                  <Badge variant={STATUS_VARIANT[r.status] ?? 'gray'}>
                    {r.status}
                  </Badge>
                </Td>
                <Td className="text-gray-400 text-sm whitespace-nowrap">
                  {new Date(r.created_at).toLocaleDateString()}
                </Td>
                <Td>
                  {r.quotation_id ? (
                    <button onClick={() => router.push(`/quotations/${r.quotation_id}`)} className="text-sm text-brand hover:underline">
                      {r.quote_number ?? 'View quotation'}
                    </button>
                  ) : (
                    <Button variant="primary" onClick={() => router.push(`/quotations/new?requestId=${r.id}&customerId=${r.customer_id}`)}>
                      Create quotation
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
