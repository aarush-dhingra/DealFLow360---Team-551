'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { quotations } from '@/lib/data';
import { Badge, InfoBanner, Button, Card, Table, Tr, Td } from '@/components/ui';

const COMMENT_LINES = ['Extended Warranty', 'Onsite Setup', 'Laptop Pro 14'];

export default function CustomerPortalPage() {
  const { token } = useParams<{ token: string }>();
  const q = quotations[0]; // In production: look up by portal token

  const [comments, setComments] = useState<Record<string, string>>({
    'Extended Warranty': 'Can this be 15% off instead of 10%?',
    'Onsite Setup': 'Can we push this to next month?',
    'Laptop Pro 14': '',
  });
  const [commentsSaved, setCommentsSaved] = useState(false);
  const [counterDiscount, setCounterDiscount] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  function updateComment(line: string, value: string) {
    setComments((prev) => ({ ...prev, [line]: value }));
    setCommentsSaved(false);
  }

  function saveComments() {
    setCommentsSaved(true);
    setTimeout(() => setCommentsSaved(false), 2000);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Minimal portal header - no internal nav */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center gap-6">
          <span className="font-semibold text-indigo-600">DealFlow360</span>
          <nav className="flex gap-4 text-sm">
            {['My Quotation', 'Messages', 'Profile'].map((item, i) => (
              <span
                key={item}
                className={`cursor-pointer ${i === 0 ? 'text-indigo-600 font-medium border-b-2 border-indigo-600 pb-0.5' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {item}
              </span>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Customer Portal Negotiation Screen</h1>
          <p className="text-sm text-gray-500 mt-0.5">Review and negotiate the quote directly - no email needed</p>
        </div>

        {/* Status */}
        <div className="mb-5">
          <Badge variant="yellow">Status: Under Negotiation</Badge>
        </div>

        {/* Line-level comments - editable */}
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Your Comments</h2>
        <Card className="mb-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Line Item', 'Comment'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {COMMENT_LINES.map((line) => (
                  <tr key={line}>
                    <td className="px-4 py-3 font-medium text-gray-900 align-top w-40">{line}</td>
                    <td className="px-4 py-2.5">
                      <textarea
                        value={comments[line] ?? ''}
                        onChange={(e) => updateComment(line, e.target.value)}
                        placeholder="Add a comment or question about this line..."
                        rows={2}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="mb-5 flex justify-end">
          <Button variant="secondary" onClick={saveComments}>
            {commentsSaved ? 'Saved' : 'Save Comments'}
          </Button>
        </div>

        {/* Counter proposal */}
        {!submitted && !confirmed && (
          <form onSubmit={handleSubmit} className="space-y-4 mb-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Counter Discount %</label>
                <input
                  type="number"
                  value={counterDiscount}
                  onChange={(e) => setCounterDiscount(e.target.value)}
                  placeholder="e.g. 15"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Requested Delivery Date</label>
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button type="submit" variant="secondary">Submit Request</Button>
              <Button variant="primary" onClick={() => setConfirmed(true)}>Confirm Quotation</Button>
            </div>
          </form>
        )}

        {submitted && !confirmed && (
          <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            Your counter-offer has been submitted. The sales team will review and get back to you.
          </div>
        )}

        {confirmed && (
          <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800 font-medium">
            Quotation confirmed. Your order is now being processed.
          </div>
        )}

        <InfoBanner>
          If final terms exceed thresholds, the quote automatically re-enters approval.
        </InfoBanner>
      </main>
    </div>
  );
}
