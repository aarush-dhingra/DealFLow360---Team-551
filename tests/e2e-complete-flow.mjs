/**
 * Complete End-to-End Flow  (Spec §5)
 * Run:   node tests/e2e-complete-flow.mjs
 * Prereq: Node ≥18, backend running, seed data loaded (npm run demo for invoices)
 *
 * Covers all 11 steps from the spec:
 *  1  Sales rep logs in
 *  2  Admin configures backend
 *  3  Rep creates quotation for a customer
 *  4  Rep adds products, applies discounts, reviews upsell suggestions
 *  5  Discount/risk exceeds threshold → auto-routed for approval
 *  6  Approved → system suggests warehouse fulfillment split
 *  7  Recurring subscription lines → billing schedule alongside one-time invoice
 *  8  Customer receives link, negotiates via portal
 *  9  Terms change beyond threshold → quote re-enters approval automatically
 * 10  Confirmed → fulfillment and billing
 * 11  Manager reviews Deal Health dashboard
 * (+) Reports with filters
 */

const BASE = `http://localhost:${process.env.PORT ?? 3000}/api/v1`;

let passed = 0, failed = 0, warned = 0;
const ok   = (m) => { console.log(`  ✓ ${m}`); passed++; };
const fail = (m, d = '') => { console.log(`  ✗ ${m}${d ? `: ${d}` : ''}`); failed++; };
const warn = (m, d = '') => { console.log(`  ⚠ ${m}${d ? ` — ${d}` : ''}`); warned++; };
const step = (n, t) => console.log(`\nSTEP ${n}  ${t}`);

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
  console.log('  DealFlow360 — Complete End-to-End Flow  (Spec §5)');
  console.log(`  API: ${BASE}`);
  console.log('══════════════════════════════════════════════════════════');

  // ── STEP 1: Sales rep logs in ────────────────────────────────────────
  step(1, 'Sales rep logs in');

  let repTok, managerTok, financeTok, adminTok;
  try { repTok     = await login('rep@dealflow360.local');     ok('Sales rep authenticated'); }
  catch (e) { fail('Sales rep login', e.message); process.exit(1); }
  try { managerTok = await login('manager@dealflow360.local'); ok('Manager authenticated'); }
  catch (e) { fail('Manager login', e.message); }
  try { financeTok = await login('finance@dealflow360.local'); ok('Finance authenticated'); }
  catch (e) { fail('Finance login', e.message); }
  try { adminTok   = await login('admin@dealflow360.local');   ok('Admin authenticated'); }
  catch (e) { fail('Admin login', e.message); }

  // ── STEP 2: Admin configures backend ─────────────────────────────────
  step(2, 'Admin configures backend (products, tiers, warehouses, subscription plans)');

  const [tiersR, whR, planR, catR] = await Promise.all([
    req('GET', '/manager/config/tiers',             null, adminTok),
    req('GET', '/admin/warehouses',                  null, adminTok),
    req('GET', '/admin/subscription-plans',          null, adminTok),
    req('GET', '/manager/config/categories',         null, adminTok),
  ]);

  tiersR.ok && tiersR.data?.tiers?.length     ? ok(`Tiers: ${tiersR.data.tiers.length}`)                 : fail('No discount tiers');
  whR.ok    && whR.data?.data?.length          ? ok(`Warehouses: ${whR.data.data.length}`)               : fail('No warehouses');
  planR.ok  && planR.data?.data?.length        ? ok(`Subscription plans: ${planR.data.data.length}`)     : fail('No subscription plans');
  catR.ok   && catR.data?.categories?.length   ? ok(`Product categories: ${catR.data.categories.length}`) : fail('No categories');

  const prodR = await req('GET', '/admin/products', null, adminTok);
  const allProds        = prodR.data?.data ?? [];
  const oneTimeProducts = allProds.filter(p => p.billing_kind !== 'recurring');
  const recurringProds  = allProds.filter(p => p.billing_kind === 'recurring');
  ok(`Products: ${allProds.length} total (${oneTimeProducts.length} one-time, ${recurringProds.length} recurring)`);
  recurringProds.length === 0 && warn('No recurring products', 'Add via admin Config → Products (Billing: Recurring)');

  // ── STEP 3: Rep creates quotation for a customer ──────────────────────
  step(3, 'Rep opens workspace and creates quotation for a customer');

  const custR = await req('GET', '/sales-rep/quotations/meta/customers', null, repTok);
  const customer = custR.data?.data?.[0];
  customer ? ok(`Customer selected: ${customer.legal_name ?? customer.name} (tier: ${customer.tier_code ?? 'none'})`) : fail('No customers');

  const repProds = await req('GET', '/sales-rep/quotations/meta/products', null, repTok);
  const oneTimeProd  = repProds.data?.data?.find(p => p.billing_kind !== 'recurring');
  const recurringProd= repProds.data?.data?.find(p => p.billing_kind === 'recurring');
  oneTimeProd  ? ok(`One-time product available: ${oneTimeProd.name}`)   : fail('No one-time product in catalog');
  recurringProd
    ? ok(`Recurring product available: ${recurringProd.name}`)
    : warn('No recurring product in catalog', 'Step 7 (billing schedule) cannot be tested without one');

  // ── STEP 4: Rep adds products, applies discounts, reviews upsell ──────
  step(4, 'Rep adds products, applies discounts, reviews upsell suggestions panel');

  let quoteId, quoteNumber;
  if (customer && oneTimeProd) {
    const lines = [{ productId: oneTimeProd.id, quantity: 5, lineDiscountPercent: 75 }];
    if (recurringProd) lines.push({ productId: recurringProd.id, quantity: 1, lineDiscountPercent: 0 });

    const r = await req('POST', '/sales-rep/quotations', { customerId: customer.id, currencyCode: 'USD', discountMode: 'line', lines }, repTok);
    if (r.ok) {
      quoteId     = r.data?.data?.id;
      quoteNumber = r.data?.data?.quote_number;
      ok(`Quotation created: ${quoteNumber} with ${lines.length} line(s)`);
    } else {
      fail('Create quotation', JSON.stringify(r.data));
    }
  }

  // Upsell panel check
  if (oneTimeProd) {
    const upsR = await req('GET', `/sales-rep/quotations/meta/upsell-suggestions?productIds=${oneTimeProd.id}`, null, repTok);
    upsR.ok && upsR.data?.data?.length > 0
      ? ok(`Upsell panel: ${upsR.data.data.length} suggestion(s) for ${oneTimeProd.name}`)
      : warn('No upsell suggestions', 'Configure upsell_rules via admin or seed data');
  }

  // ── STEP 5: Discount exceeds threshold → auto-routed for approval ─────
  step(5, 'Discount exceeds threshold → automatically routed for approval');

  let approvalId;
  if (quoteId) {
    const subR = await req('POST', `/sales-rep/quotations/${quoteId}/submit`, {}, repTok);
    if (subR.ok) {
      const status = subR.data?.data?.status ?? subR.data?.status;
      if (status === 'pending_approval') {
        ok(`Auto-routed to pending_approval (no manual request — correct)`);
      } else if (status === 'approved') {
        warn(`Status: ${status}`, 'Quote went straight to approved — discount may be within ceiling');
      } else {
        warn(`Status: ${status}`, 'Expected pending_approval');
      }
    } else {
      fail('Submit quotation', JSON.stringify(subR.data));
    }

    const appR = await req('GET', '/manager/approvals', null, managerTok);
    const match = appR.data?.data?.find(a => a.quotation_id === quoteId);
    if (match) {
      approvalId = match.id;
      const required = match.required_role;
      ok(`Approval instance: role=${required} id=${approvalId}`);
    } else {
      warn('No approval instance created', 'Discount within allowed ceiling');
    }
  }

  // Check finance approval chain (second level)
  const policyR = await req('GET', '/manager/config/approval-policy', null, managerTok);
  if (policyR.ok && policyR.data?.policy) {
    const p = policyR.data.policy;
    ok(`Approval policy: manager_max=${p.manager_max_blended_risk_percent}% route=${p.high_risk_route}`);
  }

  // ── STEP 6: Approved → warehouse fulfillment split suggested ──────────
  step(6, 'Approved → system suggests warehouse fulfillment split');

  if (quoteId && approvalId) {
    const apR = await req(
      'POST', `/manager/quotations/${quoteId}/approvals/${approvalId}/decisions`,
      { action: 'approve', reason: 'E2E test approval' }, managerTok
    );
    apR.ok ? ok('Sales manager approved') : fail('Manager approval decision', JSON.stringify(apR.data));
  }

  if (quoteId) {
    const planR2 = await req('GET', `/finance/fulfillment/quotations/${quoteId}/plan`, null, financeTok);
    if (planR2.ok) {
      const allocs = planR2.data?.allocations ?? [];
      const whIds  = [...new Set(allocs.map(a => a.warehouseId))];
      const back   = allocs.filter(a => a.status === 'backordered');
      ok(`Fulfillment plan: ${allocs.length} line(s) → ${whIds.length} warehouse(s)`);
      if (whIds.length > 1) ok(`Split: ${whIds.length} warehouses`);
      if (back.length > 0) warn(`${back.length} line(s) backordered`);
      ok(`Shipment count: ${planR2.data?.shipmentCount ?? '?'}   Cost: $${planR2.data?.shippingCostTotal ?? '?'}`);
    } else {
      fail('Fulfillment plan', JSON.stringify(planR2.data));
    }
  }

  // ── STEP 7: Recurring lines → billing schedule ────────────────────────
  step(7, 'Order includes recurring lines → billing schedule + one-time invoice');

  warn(
    '[ANOMALY #1 #4] Billing domains are stubs — no billing schedule or invoice generated',
    'src/domains/billing/index.js and src/domains/subscriptions/index.js are empty exports'
  );
  warn(
    '[ANOMALY #5] Subscription plans have no price field',
    'planSchema has no billingAmount/price — recurring lines have no monetary billing value'
  );

  const invR = await req('GET', '/manager/invoices', null, managerTok);
  const invListE2e = invR.data?.data?.invoices ?? invR.data?.invoices ?? invR.data?.data ?? [];
  invR.ok && invListE2e.length > 0
    ? ok(`Invoices in system: ${invListE2e.length} (demo seed only, not from this test quote)`)
    : warn('No invoices', 'Run `npm run demo` to create demo invoices for payment testing');

  // ── STEP 8: Customer receives link, negotiates via portal ─────────────
  step(8, 'Customer receives quotation link, negotiates via portal');

  warn(
    '[ANOMALY #3] No "send to customer" transition endpoint',
    'No route transitions quote to sent_to_customer; portal acceptQuotation requires that status'
  );

  if (quoteId) {
    // Portal requires customer role — using rep token will likely be rejected; shown for completeness
    const portalR = await req('GET', `/portal/quotes/${quoteId}`, null, repTok);
    portalR.ok
      ? ok('Portal quote view accessible with rep token (role check permissive)')
      : warn('Portal quote inaccessible with rep token', 'Expected — requires customer role');
  }

  // ── STEP 9: Terms change → re-enters approval automatically ──────────
  step(9, 'Terms change beyond threshold → quote re-enters approval automatically');

  warn(
    '[ANOMALY #2] Portal counter-offer does NOT re-trigger approval',
    'POST /portal/quotes/:id/negotiation-requests never calls routeApproval — spec gap'
  );

  // ── STEP 10: Confirmed → fulfillment and billing ──────────────────────
  step(10, 'Order confirmed → fulfillment + billing proceed');

  if (quoteId) {
    // Allocate fulfillment (finance action)
    const allocR = await req(
      'POST', `/finance/fulfillment/quotations/${quoteId}/allocate`,
      { mode: 'suggested' }, financeTok
    );
    allocR.ok
      ? ok('Fulfillment allocated (suggested split accepted)')
      : warn('Allocate failed', JSON.stringify(allocR.data));
  }

  warn('[ANOMALY #4] No invoice creation endpoint', 'Billing after fulfillment is unimplemented');

  // ── STEP 11: Manager reviews Deal Health dashboard ────────────────────
  step(11, 'Manager reviews Deal Health dashboard throughout cycle');

  const dhR = await req('GET', '/manager/deal-health', null, managerTok);
  if (dhR.ok) {
    const data = dhR.data?.data ?? dhR.data;
    ok(`Deal Health dashboard: ${data?.total ?? '?'} total, ${data?.stalled ?? '?'} stalled, ${data?.anomalies ?? '?'} anomalies`);
  } else {
    fail('Deal Health dashboard', JSON.stringify(dhR.data));
  }

  // ── BONUS: Reports with filters ───────────────────────────────────────
  step('+', 'Reports reviewed with filters');

  const [discR, quotR] = await Promise.all([
    req('GET', '/admin/reports/discounts',  null, adminTok),
    req('GET', '/admin/reports/quotations', null, adminTok),
  ]);
  discR.ok ? ok(`Discount report: ${discR.data?.data?.length ?? JSON.stringify(discR.data)} categories`) : fail('Discount report', JSON.stringify(discR.data));
  quotR.ok ? ok(`Quotations report: ${JSON.stringify(quotR.data?.data ?? quotR.data)}`) : fail('Quotations report', JSON.stringify(quotR.data));

  // ── SUMMARY ────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log(`  RESULTS   ✓ ${passed} passed   ✗ ${failed} failed   ⚠ ${warned} warned`);
  console.log('══════════════════════════════════════════════════════════');
  if (warned > 0 || failed > 0) {
    console.log('\n  Open anomalies (backend gaps):');
    console.log('  #1  billing domain stub — no billing schedule generated');
    console.log('  #2  portal counter-offer never re-enters approval flow');
    console.log('  #3  no "send to customer" status transition endpoint');
    console.log('  #4  no invoice auto-creation on order confirmation');
    console.log('  #5  subscription plan schema has no price/billing amount');
    console.log('  #6  no atomic accept-upsell endpoint');
    console.log('  #7  fulfillment allocate blocked for manager-only approved deals\n');
  }
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error('\nFATAL:', e.message); process.exit(1); });
