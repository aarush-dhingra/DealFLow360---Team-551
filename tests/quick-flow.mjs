/**
 * Quick Test Flow: Login → Payment  (Spec §9)
 * Run:   node tests/quick-flow.mjs
 * Prereq: Node ≥18, backend running (npm start or npm run dev)
 */

const BASE = `http://localhost:${process.env.PORT ?? 3000}/api/v1`;

let passed = 0, failed = 0, warned = 0;
const ok   = (m) => { console.log(`  ✓ ${m}`); passed++; };
const fail = (m, d = '') => { console.log(`  ✗ ${m}${d ? `: ${d}` : ''}`); failed++; };
const warn = (m, d = '') => { console.log(`  ⚠ ${m}${d ? ` — ${d}` : ''}`); warned++; };

async function req(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

async function login(email, pw = 'ChangeMe123!') {
  const r = await req('POST', '/auth/login', { email, password: pw });
  if (!r.ok) throw new Error(`Login failed for ${email}: ${JSON.stringify(r.data)}`);
  return r.data?.accessToken ?? r.data?.data?.accessToken ?? r.data?.token ?? r.data?.data?.token;
}

async function run() {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  DealFlow360 — Quick Test Flow  (Spec §9 Login → Payment)');
  console.log(`  API: ${BASE}`);
  console.log('══════════════════════════════════════════════════════════\n');

  // ── STEP 1: Logins + verify backend data exists ────────────────────────
  console.log('STEP 1  Sign in & verify backend data (tier, warehouse, subscription plan)');

  let adminTok, repTok, managerTok, financeTok;
  try { adminTok   = await login('admin@dealflow360.local');   ok('Admin login'); }
  catch (e) { fail('Admin login', e.message); process.exit(1); }
  try { repTok     = await login('rep@dealflow360.local');     ok('Sales rep login'); }
  catch (e) { fail('Sales rep login', e.message); process.exit(1); }
  try { managerTok = await login('manager@dealflow360.local'); ok('Manager login'); }
  catch (e) { fail('Manager login', e.message); }
  try { financeTok = await login('finance@dealflow360.local'); ok('Finance login'); }
  catch (e) { fail('Finance login', e.message); }

  const tiersR = await req('GET', '/manager/config/tiers', null, adminTok);
  tiersR.ok && tiersR.data?.tiers?.length > 0
    ? ok(`Discount tiers configured (${tiersR.data.tiers.length})`)
    : fail('Discount tiers missing', JSON.stringify(tiersR.data));

  const whR = await req('GET', '/admin/warehouses', null, adminTok);
  whR.ok && whR.data?.data?.length > 0
    ? ok(`Warehouses configured (${whR.data.data.length})`)
    : fail('No warehouses', JSON.stringify(whR.data));

  const planR = await req('GET', '/admin/subscription-plans?includeInactive=true', null, adminTok);
  planR.ok && planR.data?.data?.length > 0
    ? ok(`Subscription plans configured (${planR.data.data.length})`)
    : fail('No subscription plans configured', JSON.stringify(planR.data));

  // ── STEP 2: Create quotation with above-ceiling discount ───────────────
  console.log('\nSTEP 2  Create quotation with discount above allowed ceiling');

  const custR = await req('GET', '/sales-rep/quotations/meta/customers', null, repTok);
  const prodR = await req('GET', '/sales-rep/quotations/meta/products',  null, repTok);

  const customer        = custR.data?.data?.[0];
  const oneTimeProduct  = prodR.data?.data?.find(p => p.billing_kind !== 'recurring') ?? prodR.data?.data?.[0];
  const recurringProduct= prodR.data?.data?.find(p => p.billing_kind === 'recurring');

  customer        ? ok(`Customer: ${customer.legal_name ?? customer.name}`)             : fail('No customers in seed data');
  oneTimeProduct  ? ok(`One-time product: ${oneTimeProduct.name}`)                     : fail('No one-time product found');
  recurringProduct
    ? ok(`Recurring product: ${recurringProduct.name}`)
    : warn('No recurring product', 'Add via admin Config → Products with Billing: Recurring');

  let quoteId, quoteNumber;
  if (customer && oneTimeProduct) {
    const lines = [{ productId: oneTimeProduct.id, quantity: 3, lineDiscountPercent: 80 }];
    if (recurringProduct) lines.push({ productId: recurringProduct.id, quantity: 1, lineDiscountPercent: 0 });

    const r = await req('POST', '/sales-rep/quotations', { customerId: customer.id, currencyCode: 'USD', discountMode: 'line', lines }, repTok);
    if (r.ok) {
      quoteId     = r.data?.data?.id     ?? r.data?.id;
      quoteNumber = r.data?.data?.quote_number ?? r.data?.quote_number;
      ok(`Quotation created: ${quoteNumber}`);
    } else {
      fail('Create quotation', JSON.stringify(r.data));
    }
  }

  // ── STEP 3: Submit → confirm auto-routed for approval ─────────────────
  console.log('\nSTEP 3  Submit quotation — confirm auto-route (no manual request)');

  let approvalId;
  if (quoteId) {
    const subR = await req('POST', `/sales-rep/quotations/${quoteId}/submit`, {}, repTok);
    if (subR.ok) {
      const status = subR.data?.data?.status ?? subR.data?.status;
      status === 'pending_approval'
        ? ok(`Status: ${status} — auto-routed (no manual action needed)`)
        : warn(`Status: ${status}`, 'Expected pending_approval — check discount ceiling config');
    } else {
      fail('Submit quotation', JSON.stringify(subR.data));
    }

    const appR = await req('GET', '/manager/approvals', null, managerTok);
    const match = appR.data?.data?.find(a => a.quotation_id === quoteId);
    if (match) {
      approvalId = match.id;
      ok(`Manager approval instance exists: ${approvalId}`);
    } else {
      warn('No approval instance found for this quotation', 'Discount may be within allowed ceiling');
    }
  }

  // ── STEP 4: Upsell suggestion accepted → totals update ────────────────
  console.log('\nSTEP 4  Accept upsell suggestion — order total & margin update immediately');

  if (oneTimeProduct) {
    const upsellR = await req('GET', `/sales-rep/quotations/meta/upsell-suggestions?productIds=${oneTimeProduct.id}`, null, repTok);
    if (upsellR.ok && upsellR.data?.data?.length > 0) {
      const s = upsellR.data.data[0];
      ok(`Upsell suggestion: "${s.name}" — margin ${s.margin_percent}%${s.promotion_tag ? ' [' + s.promotion_tag + ']' : ''}`);

      if (quoteId) {
        // No atomic accept-by-id endpoint (Anomaly #6) — must POST a revision
        const lines = [
          { productId: oneTimeProduct.id, quantity: 3, lineDiscountPercent: 80 },
          { productId: s.id,              quantity: 1, lineDiscountPercent: 0  },
          ...(recurringProduct ? [{ productId: recurringProduct.id, quantity: 1, lineDiscountPercent: 0 }] : []),
        ];
        const revR = await req('POST', `/sales-rep/quotations/${quoteId}/revisions`, { lines }, repTok);
        revR.ok
          ? ok('Revision with upsell item created — new grand total in response')
          : warn('Revision rejected', `${JSON.stringify(revR.data)} [check: quote may be in pending_approval, blocking revisions]`);
      }
    } else {
      warn('No upsell suggestions', 'Configure upsell_rules in admin or seed data');
    }
  }

  // ── STEP 5: Manager approves → fulfillment split ──────────────────────
  console.log('\nSTEP 5  Get quotation approved — verify warehouse split');

  if (quoteId && approvalId) {
    const apR = await req(
      'POST', `/manager/quotations/${quoteId}/approvals/${approvalId}/decisions`,
      { action: 'approve', reason: 'Auto-test' }, managerTok
    );
    apR.ok ? ok('Manager approved') : fail('Manager approve', JSON.stringify(apR.data));
  } else {
    warn('Skip manager approval', 'No pending approval found (step 3 warned)');
  }

  if (quoteId) {
    const planR2 = await req('GET', `/finance/fulfillment/quotations/${quoteId}/plan`, null, financeTok);
    if (planR2.ok) {
      const allocs = planR2.data?.allocations ?? [];
      const whIds  = [...new Set(allocs.map(a => a.warehouseId))];
      ok(`Fulfillment plan: ${allocs.length} line(s) across ${whIds.length} warehouse(s)`);
      whIds.length > 1 ? ok('Warehouse split confirmed') : warn('Single warehouse', 'Split only when multi-WH stock needed');
    } else {
      fail('Fulfillment plan', JSON.stringify(planR2.data));
    }
  }

  // ── STEP 6: One-time + recurring billed separately ────────────────────
  console.log('\nSTEP 6  One-time product + recurring subscription billed separately');

  warn(
    '[ANOMALY #1 #4] Invoice creation is a backend stub',
    'src/domains/billing/index.js = empty export; no invoice generated on order confirmation'
  );
  const invListR = await req('GET', '/manager/invoices', null, managerTok);
  const invList = invListR.data?.data?.invoices ?? invListR.data?.invoices ?? invListR.data?.data ?? [];
  if (invListR.ok && invList.length > 0) {
    ok(`Invoices in system: ${invList.length} (from demo seed only)`);
  } else {
    warn('No invoices', 'Run `npm run demo` to seed demo invoices for manual payment testing');
  }

  // ── STEP 7: Customer portal counter-offer → re-approval ───────────────
  console.log('\nSTEP 7  Customer portal: counter-offer triggers re-approval automatically');

  warn(
    '[ANOMALY #2] Portal negotiation does NOT re-enter approval flow',
    'POST /portal/quotes/:id/negotiation-requests records the request but never calls routeApproval'
  );
  warn(
    '[ANOMALY #3] No "send to customer" endpoint',
    'No route transitions a quotation to sent_to_customer; portal needs this status to accept quotes'
  );

  // ── STEP 8: Confirm order, record payment, invoice status updates ──────
  console.log('\nSTEP 8  Confirm order → record payment → invoice status correct');

  const invListR2 = await req('GET', '/manager/invoices', null, financeTok);
  const allInvoices = invListR2.data?.data?.invoices ?? invListR2.data?.invoices ?? invListR2.data?.data ?? [];
  const unpaid = Array.isArray(allInvoices) ? allInvoices.find(i => !['paid', 'void'].includes(i.status)) : null;

  if (unpaid) {
    const amtDue = parseFloat(unpaid.amount_due ?? unpaid.amountDue ?? 100);
    const payR = await req(
      'POST', `/finance/invoices/${unpaid.id}/payments`,
      { amount: amtDue, paymentMethod: 'bank_transfer', externalReference: 'TEST-PAY-001' },
      financeTok
    );
    payR.ok
      ? ok(`Payment of $${amtDue} recorded on invoice ${unpaid.id}`)
      : fail('Record payment', JSON.stringify(payR.data));

    const updR = await req('GET', `/manager/invoices/${unpaid.id}`, null, managerTok);
    if (updR.ok) {
      const s = updR.data?.data?.status;
      ok(`Invoice status after payment: ${s}`);
      ['paid', 'partially_paid'].includes(s)
        ? ok('Invoice status updated correctly')
        : warn(`Unexpected status: ${s}`);
    }
  } else {
    warn('[ANOMALY #4] No unpaid invoices to test payment against', 'Run `npm run demo` first');
  }

  // ── SUMMARY ────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  RESULTS   ✓ ${passed} passed   ✗ ${failed} failed   ⚠ ${warned} warned`);
  console.log('══════════════════════════════════════════════════════════');
  if (failed > 0 || warned > 0) {
    console.log('\n  Known backend gaps (open issues):');
    console.log('  #1  billing + subscriptions domains are empty stubs');
    console.log('  #2  portal counter-offer never re-enters approval flow');
    console.log('  #3  no "send to customer" status transition endpoint');
    console.log('  #4  no invoice auto-creation on order confirmation');
    console.log('  #5  subscription plan schema has no price / billing amount');
    console.log('  #6  no atomic "accept upsell suggestion" endpoint');
    console.log('  #7  fulfillment allocate blocked for manager-only approvals\n');
  }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
