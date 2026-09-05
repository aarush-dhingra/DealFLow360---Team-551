// Mock seed data - replace with API calls to Express backend

export type UserRole = 'sales_rep' | 'sales_manager' | 'finance' | 'admin' | 'customer';

export const currentUser = {
  id: 'u1',
  name: 'J. Rao',
  role: 'sales_rep' as UserRole,
  email: 'j.rao@dealflow.com',
};

export type QuotationStatus = 'Draft' | 'Pending Approval' | 'Approved' | 'Negotiation' | 'Confirmed';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface QuotationLine {
  product: string;
  qty: number;
  price: number;
  discount: number;
  limit: number;
  category: 'Hardware' | 'Services' | 'Subscription';
  status: 'OK' | string; // e.g. 'OVER (+8pt)'
}

export interface Quotation {
  id: string;
  customer: string;
  customerTier: 'Bronze' | 'Silver' | 'Gold';
  amount: number;
  status: QuotationStatus;
  assignedTo: string;
  createdAt: string;
  lastActivity: string;
  priceList: string;
  lines: QuotationLine[];
  upsells: { name: string; marginDelta: number; promo?: string }[];
  blendedRisk: RiskLevel;
  pointsOver: number;
}

export const quotations: Quotation[] = [
  {
    id: 'Q-1042',
    customer: 'Acme Corp',
    customerTier: 'Gold',
    amount: 2730,
    status: 'Pending Approval',
    assignedTo: 'J. Rao',
    createdAt: '2026-08-18',
    lastActivity: '2026-08-22',
    priceList: 'Gold USD',
    blendedRisk: 'HIGH',
    pointsOver: 8,
    lines: [
      { product: 'Laptop Pro 14', qty: 2, price: 1200, discount: 12, limit: 15, category: 'Hardware', status: 'OK' },
      { product: 'Onsite Setup Service', qty: 1, price: 450, discount: 18, limit: 10, category: 'Services', status: 'OVER (+8pt)' },
      { product: 'Extended Warranty', qty: 1, price: 180, discount: 10, limit: 15, category: 'Services', status: 'OK' },
    ],
    upsells: [
      { name: 'Wireless Mouse', marginDelta: 18 },
      { name: 'Docking Station', marginDelta: 0, promo: 'Promo: 12% off' },
      { name: 'Care Plan 2yr', marginDelta: 46 },
    ],
  },
  {
    id: 'Q-1039',
    customer: 'Beta Industries',
    customerTier: 'Silver',
    amount: 28900,
    status: 'Pending Approval',
    assignedTo: 'J. Rao',
    createdAt: '2026-08-20',
    lastActivity: '2026-08-21',
    priceList: 'Silver USD',
    blendedRisk: 'MEDIUM',
    pointsOver: 3,
    lines: [
      { product: 'Docking Station', qty: 10, price: 180, discount: 13, limit: 10, category: 'Hardware', status: 'OVER (+3pt)' },
    ],
    upsells: [{ name: 'Support SLA', marginDelta: 120 }],
  },
  {
    id: 'Q-1035',
    customer: 'Nova Retail',
    customerTier: 'Gold',
    amount: 9750,
    status: 'Approved',
    assignedTo: 'R. Iyer',
    createdAt: '2026-08-15',
    lastActivity: '2026-08-16',
    priceList: 'Gold USD',
    blendedRisk: 'LOW',
    pointsOver: 0,
    lines: [
      { product: 'Laptop Pro 14', qty: 5, price: 1200, discount: 8, limit: 15, category: 'Hardware', status: 'OK' },
      { product: 'Care Plan 2yr', qty: 5, price: 150, discount: 5, limit: 15, category: 'Subscription', status: 'OK' },
    ],
    upsells: [],
  },
  {
    id: 'Q-1030',
    customer: 'Zenith Co',
    customerTier: 'Silver',
    amount: 15300,
    status: 'Negotiation',
    assignedTo: 'J. Rao',
    createdAt: '2026-08-10',
    lastActivity: '2026-08-24',
    priceList: 'Silver USD',
    blendedRisk: 'LOW',
    pointsOver: 0,
    lines: [
      { product: 'Docking Station', qty: 20, price: 180, discount: 10, limit: 10, category: 'Hardware', status: 'OK' },
    ],
    upsells: [],
  },
  {
    id: 'Q-1028',
    customer: 'Orion Ltd',
    customerTier: 'Gold',
    amount: 41000,
    status: 'Confirmed',
    assignedTo: 'M. Shah',
    createdAt: '2026-08-05',
    lastActivity: '2026-08-12',
    priceList: 'Gold EUR',
    blendedRisk: 'LOW',
    pointsOver: 0,
    lines: [],
    upsells: [],
  },
  {
    id: 'Q-1021',
    customer: 'Delta LLC',
    customerTier: 'Bronze',
    amount: 3200,
    status: 'Draft',
    assignedTo: 'J. Rao',
    createdAt: '2026-08-28',
    lastActivity: '2026-08-28',
    priceList: 'Bronze USD',
    blendedRisk: 'LOW',
    pointsOver: 0,
    lines: [],
    upsells: [],
  },
];

export const approvalAuditTrail = [
  { user: 'J. Rao', action: 'Submitted', date: 'Aug 20', note: 'Initial 12% discount' },
  { user: 'M. Shah', action: 'Returned', date: 'Aug 21', note: 'Requested justification' },
  { user: 'J. Rao', action: 'Resubmitted', date: 'Aug 22', note: 'Added margin note' },
];

export const fulfillmentOrders = [
  {
    id: 'Q-1042',
    customer: 'Acme Corp',
    status: 'Split Pending',
    warehouses: 'Main + East Depot',
    split: [
      { warehouse: 'Main Warehouse', qtyFulfilled: 18, shipments: 1, cost: 42 },
      { warehouse: 'East Depot', qtyFulfilled: 6, shipments: 1, cost: 29 },
    ],
  },
  {
    id: 'Q-1030',
    customer: 'Zenith Co',
    status: 'Backorder',
    warehouses: 'East Depot',
    split: [{ warehouse: 'East Depot', qtyFulfilled: 0, shipments: 0, cost: 0 }],
  },
];

export const warehouseStock = [
  { warehouse: 'Main Warehouse', product: 'Laptop Pro 14', inStock: 40, reserved: 18, available: 22 },
  { warehouse: 'East Depot', product: 'Laptop Pro 14', inStock: 10, reserved: 6, available: 4 },
  { warehouse: 'Main Warehouse', product: 'Docking Station', inStock: 65, reserved: 12, available: 53 },
];

export const subscriptions = [
  { id: 'sub-1', customer: 'Acme Corp', plan: 'Care Plan 2yr', cycle: 'Monthly', nextBill: 'Sep 15', amount: 46, status: 'Active' },
  { id: 'sub-2', customer: 'Beta Industries', plan: 'Support SLA', cycle: 'Quarterly', nextBill: 'Nov 1', amount: 300, status: 'Active' },
  { id: 'sub-3', customer: 'Delta LLC', plan: 'Care Plan 1yr', cycle: 'Monthly', nextBill: '-', amount: 30, status: 'Paused' },
  { id: 'sub-4', customer: 'Nova Retail', plan: 'Support SLA', cycle: 'Monthly', nextBill: '-', amount: 100, status: 'Cancelled' },
  { id: 'sub-5', customer: 'Zenith Co', plan: 'Care Plan 2yr', cycle: 'Monthly', nextBill: '-', amount: 46, status: 'Cancelled' },
];

export const invoices = [
  { id: 'INV-1042', customer: 'Acme Corp', amount: 2730, status: 'Unpaid', dueDate: 'Sep 10', quotationId: 'Q-1042' },
  { id: 'INV-1043', customer: 'Acme Corp', amount: 46, status: 'Paid', dueDate: 'Sep 15', quotationId: 'Q-1042' },
  { id: 'INV-1038', customer: 'Nova Retail', amount: 9750, status: 'Paid', dueDate: 'Aug 30', quotationId: 'Q-1035' },
  { id: 'INV-1031', customer: 'Zenith Co', amount: 1200, status: 'Unpaid', dueDate: 'Sep 5', quotationId: 'Q-1030' },
  { id: 'INV-1029', customer: 'Orion Ltd', amount: 8200, status: 'Unpaid', dueDate: 'Sep 12', quotationId: 'Q-1028' },
  { id: 'INV-1020', customer: 'Orion Ltd', amount: 12500, status: 'Paid', dueDate: 'Aug 25', quotationId: 'Q-1028' },
];

export const dealHealthAlerts = [
  { deal: 'Zenith Co', issue: 'Idle 9 days', flagged: 'Aug 24', action: 'Nudge sent', type: 'stalled' },
  { deal: 'Delta LLC', issue: 'Discount 22% vs avg 8%', flagged: 'Aug 25', action: 'Escalated to Manager', type: 'anomaly' },
  { deal: 'Beta Industries', issue: 'Delivery date at risk', flagged: 'Aug 26', action: 'Pending', type: 'slippage' },
];

export const products = [
  { id: 'p1', name: 'Laptop Pro 14', category: 'Hardware', variants: '3(size)', price: 1200, unit: 'Each', tax: '15%', status: 'Active', subscription: false },
  { id: 'p2', name: 'Onsite Setup Service', category: 'Services', variants: '-', price: 450, unit: 'Each', tax: '10%', status: 'Active', subscription: false },
  { id: 'p3', name: 'Docking Station', category: 'Hardware', variants: '3(color)', price: 180, unit: 'Each', tax: '15%', status: 'Active', subscription: false },
  { id: 'p4', name: 'Care Plan 3 years', category: 'Subscription', variants: '-', price: 40, unit: 'Recurring', tax: '0%', status: 'Active', subscription: true },
  { id: 'p5', name: 'Extended Warranty', category: 'Services', variants: '-', price: 180, unit: 'Each', tax: '10%', status: 'Active', subscription: false },
  { id: 'p6', name: 'Support SLA', category: 'Subscription', variants: '-', price: 100, unit: 'Recurring', tax: '0%', status: 'Active', subscription: true },
];

export const discountTiers = {
  tierCeilings: [
    { tier: 'Bronze', maxDiscount: 5 },
    { tier: 'Silver', maxDiscount: 10 },
    { tier: 'Gold', maxDiscount: 15 },
  ],
  categoryCeilings: [
    { category: 'Hardware', maxDiscount: 15 },
    { category: 'Services', maxDiscount: 10 },
    { category: 'Subscription', maxDiscount: 5 },
  ],
  approvalChain: [
    { range: 'Within tier/category limit', approval: 'No approval needed' },
    { range: 'Over limit, blended risk MEDIUM', approval: 'Sales Manager' },
    { range: 'Over limit, blended risk HIGH', approval: 'Sales Manager then Finance' },
  ],
};

// Blended risk score calculation
export function computeBlendedRisk(lines: QuotationLine[]): { risk: RiskLevel; pointsOver: number; worstLine: number } {
  let totalOver = 0;
  let worstLine = 0;
  for (const line of lines) {
    const over = Math.max(0, line.discount - line.limit);
    totalOver += over;
    if (over > worstLine) worstLine = over;
  }
  const risk: RiskLevel = totalOver === 0 ? 'LOW' : totalOver <= 5 ? 'MEDIUM' : 'HIGH';
  return { risk, pointsOver: totalOver, worstLine };
}

// Maps backend approval route values to frontend risk display labels
export type BackendApprovalRoute = 'none' | 'manager' | 'manager_then_finance' | 'finance_direct';

export function routeToRisk(route: BackendApprovalRoute): RiskLevel {
  if (route === 'none') return 'LOW';
  if (route === 'manager') return 'MEDIUM';
  return 'HIGH'; // manager_then_finance | finance_direct
}
