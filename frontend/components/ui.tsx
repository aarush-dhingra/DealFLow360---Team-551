'use client';

import React from 'react';

// Status badge
type BadgeVariant = 'yellow' | 'green' | 'red' | 'blue' | 'gray' | 'orange';
export function Badge({ children, variant = 'gray' }: { children: React.ReactNode; variant?: BadgeVariant }) {
  const cls: Record<BadgeVariant, string> = {
    yellow: 'bg-amber-100 text-amber-800',
    orange: 'bg-orange-100 text-orange-800',
    green: 'bg-emerald-100 text-emerald-800',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-brand-50 text-brand-dim',
    gray: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${cls[variant]}`}>
      {children}
    </span>
  );
}

// Risk badge
export function RiskBadge({ risk }: { risk: 'LOW' | 'MEDIUM' | 'HIGH' }) {
  const map = { LOW: 'green', MEDIUM: 'yellow', HIGH: 'red' } as const;
  return <Badge variant={map[risk]}>{risk}</Badge>;
}

// Info banner (golden hint at bottom of detail screens)
export function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      {children}
    </div>
  );
}

// Page header
export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
    </div>
  );
}

// Card
export function Card({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`} onClick={onClick}>
      {children}
    </div>
  );
}

// Stat card
export function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </Card>
  );
}

// Table
export function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {headers.map((h) => (
              <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, onClick, clickable }: { children: React.ReactNode; onClick?: () => void; clickable?: boolean }) {
  return (
    <tr
      onClick={onClick}
      className={`${clickable ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}`}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-gray-700 ${className}`}>{children}</td>;
}

// Button
type BtnVariant = 'primary' | 'secondary' | 'danger' | 'warning' | 'ghost';
export function Button({
  children,
  variant = 'secondary',
  onClick,
  type = 'button',
  className = '',
  disabled,
}: {
  children: React.ReactNode;
  variant?: BtnVariant;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
  disabled?: boolean;
}) {
  const cls: Record<BtnVariant, string> = {
    primary: 'bg-brand text-white hover:bg-brand-dim focus:ring-brand',
    secondary: 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    warning: 'bg-amber-500 text-white hover:bg-amber-600',
    ghost: 'text-gray-600 hover:bg-gray-100',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${cls[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

// Filter chip group
export function FilterChip({ label, count, active, onClick, color = 'gray' }: {
  label: string; count?: number; active?: boolean; onClick?: () => void; color?: 'yellow' | 'green' | 'red' | 'gray';
}) {
  const clr = {
    yellow: active ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-amber-50',
    green: active ? 'bg-emerald-100 text-emerald-800 border-emerald-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-emerald-50',
    red: active ? 'bg-red-100 text-red-700 border-red-300' : 'bg-white text-gray-600 border-gray-300 hover:bg-red-50',
    gray: active ? 'bg-gray-200 text-gray-800 border-gray-400' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50',
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${clr[color]}`}
    >
      {count !== undefined && (
        <span className="text-xs font-semibold">{count}</span>
      )}
      {label}
    </button>
  );
}

// Pipeline steps
export function PipelineStep({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, i) => (
        <React.Fragment key={step}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-semibold ${
                i < current
                  ? 'bg-emerald-500 border-emerald-500 text-white'
                  : i === current
                  ? 'bg-brand border-brand text-white'
                  : 'bg-white border-gray-300 text-gray-400'
              }`}
            >
              {i < current ? '✓' : i + 1}
            </div>
            <span className={`text-xs ${i === current ? 'text-brand font-medium' : 'text-gray-400'}`}>{step}</span>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mb-4 ${i < current ? 'bg-emerald-400' : 'bg-gray-200'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}
