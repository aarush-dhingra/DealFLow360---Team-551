import { redirect } from 'next/navigation';

// Portal access is authenticated by the customer account, not by a URL token.
export default function LegacyCustomerPortalRoute() {
  redirect('/portal');
}
