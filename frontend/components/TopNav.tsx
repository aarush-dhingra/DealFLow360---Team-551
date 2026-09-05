'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { getUser, clearToken } from '@/lib/api';

const navItems = [
  { label: 'Dashboard',    href: '/dashboard' },
  { label: 'Quotations',   href: '/quotations' },
  { label: 'Approvals',    href: '/approvals' },
  { label: 'Fulfillment',  href: '/fulfillment' },
  { label: 'Subscriptions',href: '/subscriptions' },
  { label: 'Invoices',     href: '/invoices' },
  { label: 'Deal Health',  href: '/deal-health' },
  { label: 'Reports',      href: '/reports' },
  { label: 'Products',     href: '/products' },
];

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();
  const user = getUser();
  const initials = user?.displayName
    ? user.displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'JR';
  const displayName = user?.displayName ?? 'J. Rao';

  function logout() {
    clearToken();
    router.push('/');
  }

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="flex items-center h-14 px-4 gap-1">
        <Link href="/dashboard" className="mr-4 shrink-0 flex items-center gap-2">
          <Image src="/logo-256.png" alt="DealFlow360" width={28} height={28} className="rounded" priority />
          <span className="font-semibold text-indigo-600 text-base">DealFlow360</span>
        </Link>
        <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
          {navItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-500">{displayName}</span>
          <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center">
            {initials}
          </div>
          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
}
