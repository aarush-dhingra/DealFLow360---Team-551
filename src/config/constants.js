export const ROLES = {
  ADMIN: 'admin',
  SALES_MANAGER: 'sales_manager',
  SALES_REP: 'sales_rep',
  FINANCE_OPERATIONS: 'finance_operations',
  CUSTOMER: 'customer',
};

export const APPROVAL_ROUTES = {
  NONE: 'none',
  MANAGER: 'manager',
  MANAGER_THEN_FINANCE: 'manager_then_finance',
  FINANCE_DIRECT: 'finance_direct',
};

export const QUOTE_STATUS = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  PENDING_FINANCE_APPROVAL: 'pending_finance_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  RETURNED_FOR_REVISION: 'returned_for_revision',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  FULFILLED: 'fulfilled',
  PAID: 'paid',
};

export const HEALTH_BANDS = {
  NORMAL: 'normal',
  WARNING: 'warning',
  MANAGER: 'manager',
  FINANCE: 'finance',
};

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
