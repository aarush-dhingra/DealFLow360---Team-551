'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import { getUser, clearToken } from '@/lib/api';

const ALL_ROLES = ['sales_rep', 'sales_manager', 'finance_operations', 'admin'];

// Flat nav items (never grouped into dropdowns)
const flatNavItems = [
  { label: 'Dashboard',     href: '/dashboard',             roles: ALL_ROLES },
  { label: 'Quotations',    href: '/quotations',            roles: ['sales_rep', 'sales_manager', 'finance_operations', 'admin'] },
  { label: 'Negotiations',  href: '/negotiations',          roles: ['sales_rep', 'sales_manager', 'finance_operations', 'admin'] },
  { label: 'Approvals',     href: '/approvals',             roles: ['sales_manager', 'admin'] },
  { label: 'Fulfillment',   href: '/fulfillment',           roles: ['finance_operations'] },
  { label: 'Invoices',      href: '/invoices',              roles: ['finance_operations'] },
  { label: 'Quote Requests', href: '/quote-requests',       roles: ['sales_rep'] },
  { label: 'Deal Health',   href: '/deal-health',           roles: ['sales_manager'] },
  { label: 'Reports',       href: '/reports',               roles: ['sales_manager'] },
  { label: 'Products',      href: '/products',              roles: ['sales_manager'] },
  { label: 'Fin: Approvals',   href: '/finance/approvals',     roles: ['finance_operations'] },
  { label: 'Fin: Fulfillment', href: '/finance/fulfillment',   roles: ['finance_operations'] },
  { label: 'Fin: Payments',    href: '/finance/payments',       roles: ['finance_operations'] },
  { label: 'Fin: Credits',     href: '/finance/credit-notes',  roles: ['finance_operations'] },
];

// Admin-only grouped dropdowns
const adminGroups = [
  {
    label: 'Operations ▾',
    items: [
      { label: 'Fulfillment',    href: '/fulfillment' },
      { label: 'Deal Health',    href: '/deal-health' },
      { label: 'Reports',        href: '/reports' },
    ],
  },
  {
    label: 'Finance ▾',
    items: [
      { label: 'Invoices',         href: '/invoices' },
      { label: 'Fin: Approvals',   href: '/finance/approvals' },
      { label: 'Fin: Fulfillment', href: '/finance/fulfillment' },
      { label: 'Fin: Payments',    href: '/finance/payments' },
      { label: 'Fin: Credits',     href: '/finance/credit-notes' },
    ],
  },
  {
    label: 'Config ▾',
    items: [
      { label: 'Products',       href: '/products' },
      { label: 'Users',          href: '/settings/users' },
      { label: 'Tier Program',   href: '/settings/tier-program' },
      { label: 'Customers',      href: '/settings/customers' },
      { label: 'Subscriptions',  href: '/subscriptions' },
    ],
  },
];

function NavDropdown({ label, items, pathname }: { label: string; items: { label: string; href: string }[]; pathname: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = items.some((i) => pathname === i.href || pathname.startsWith(i.href + '/'));

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap transition-colors ${
          isActive ? 'bg-brand-50 text-brand-dim' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        {label}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden py-1">
          {items.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2 text-sm transition-colors ${
                  active ? 'bg-brand-50 text-brand-dim font-medium' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [initials, setInitials] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [userRoles, setUserRoles] = useState<string[]>([]);

  useEffect(() => {
    const user = getUser();
    setDisplayName(user?.displayName ?? '');
    setEmail(user?.email ?? '');
    setUserRoles(user?.roles ?? []);
    setInitials(
      user?.displayName
        ? user.displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
        : ''
    );
  }, []);

  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function logout() {
    clearToken();
    router.push('/');
  }

  const isAdmin = userRoles.includes('admin');

  const visibleFlat = userRoles.length === 0
    ? flatNavItems
    : flatNavItems.filter((item) => item.roles.some((r) => userRoles.includes(r)));

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="flex min-w-0 items-center h-14 px-4 gap-1">
        <Link href="/dashboard" className="mr-4 shrink-0 flex items-center gap-2">
          <Image src="/logo-256.png" alt="DealFlow360" width={28} height={28} className="rounded" priority />
          <span className="font-semibold text-base text-gray-900">DealFlow<span className="text-brand">360</span></span>
        </Link>

        <nav className="flex min-w-0 flex-1 items-center gap-0.5 py-1">
          <div className="flex items-center gap-0.5 overflow-x-auto min-w-0">
            {visibleFlat.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded text-sm font-medium whitespace-nowrap transition-colors ${
                    active ? 'bg-brand-50 text-brand-dim' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          {isAdmin && adminGroups.map((group) => (
            <NavDropdown key={group.label} label={group.label} items={group.items} pathname={pathname} />
          ))}
        </nav>

        <div className="ml-auto shrink-0 relative" ref={ref}>
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-brand-50 text-brand-dim text-xs font-semibold flex items-center justify-center">
              {initials}
            </div>
            <span className="text-sm font-medium text-gray-700">{displayName}</span>
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl border border-gray-200 shadow-lg z-50 overflow-hidden">
              <div className="flex flex-col items-center px-4 pt-5 pb-4 border-b border-gray-100">
                <div className="w-12 h-12 rounded-full bg-brand-50 text-brand-dim text-base font-bold flex items-center justify-center mb-3">
                  {initials}
                </div>
                <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                {email && <p className="text-xs text-gray-400 mt-0.5">{email}</p>}
              </div>
              <div className="p-1.5">
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
