import { PageHeader } from '@/components/ui';

export default function SubscriptionsPage() {
  return (
    <div>
      <PageHeader title="Subscriptions" subtitle="Recurring plan management across all customers" />
      <div className="mt-20 flex flex-col items-center justify-center text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-5">
          <svg className="w-7 h-7 text-brand-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <h2 className="text-base font-semibold text-gray-800 mb-2">Coming Soon</h2>
        <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
          Subscription management is under active development and will be available in a future release.
        </p>
      </div>
    </div>
  );
}
