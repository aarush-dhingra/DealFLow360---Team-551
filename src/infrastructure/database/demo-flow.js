/**
 * Demo flow seeder — run AFTER npm run db:seed.
 * Creates quotations in every approval/fulfillment state for the
 * 8-step hackathon test flow demo.
 *
 * Usage:  node src/infrastructure/database/demo-flow.js
 */
import 'dotenv/config';
import { pool } from './pool.js';
import { createQuoteVersion, quoteNumber, routeApproval } from '../../domains/sales-rep/quotation.service.js';
import { inTransaction } from './transaction.js';

const client = await pool.connect();

async function dbId(table, col, val) {
  const { rows } = await client.query(`SELECT id FROM ${table} WHERE ${col} = $1`, [val]);
  if (!rows[0]) throw new Error(`Missing seed prerequisite: ${table}.${col}=${val} — run npm run db:seed first`);
  return rows[0].id;
}

// ─── Pull IDs seeded by npm run db:seed ──────────────────────────────────────
const repId     = await dbId('users',      'email',      'rep@dealflow360.local');
const managerId = await dbId('users',      'email',      'manager@dealflow360.local');
const acmeId    = await dbId('customers',  'legal_name', 'Acme Corp');
const betaId    = await dbId('customers',  'legal_name', 'Beta Industries');
const laptopId  = await dbId('products',   'sku',        'LAPTOP-PRO');
const dockId    = await dbId('products',   'sku',        'DOCK-USBC');
const setupId   = await dbId('products',   'sku',        'SETUP-SVC');
const supportId = await dbId('products',   'sku',        'SUPPORT-MONTHLY');
const mainWhId  = await dbId('warehouses', 'code',       'MAIN');
const eastWhId  = await dbId('warehouses', 'code',       'EAST');

// ─── Reset inventory to a known state ────────────────────────────────────────
// LAPTOP: MAIN=3, EAST=4 → ordering 5 forces a two-warehouse split
await client.query('BEGIN');
for (const [wh, prod, qty] of [
  [mainWhId, laptopId,   3],
  [eastWhId, laptopId,   4],
  [mainWhId, dockId,    15],
  [mainWhId, setupId,  100],
  [mainWhId, supportId,100],
]) {
  await client.query(
    `INSERT INTO inventory_levels (warehouse_id, product_id, quantity_on_hand, quantity_reserved, reorder_point)
     VALUES ($1,$2,$3,0,2)
     ON CONFLICT (warehouse_id, product_id) DO UPDATE
       SET quantity_on_hand=$3, quantity_reserved=0`,
    [wh, prod, qty]
  );
}
await client.query('COMMIT');
console.log('✓ Inventory reset  (LAPTOP: MAIN=3, EAST=4 for warehouse-split demo)');

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function fullCustomer(c, customerId) {
  const { rows } = await c.query(
    `SELECT c.*, ct.code AS tier_code, ct.entitlement_discount_percent,
            ct.policy_version AS tier_policy_version
     FROM customers c JOIN customer_tiers ct ON ct.id=c.tier_id WHERE c.id=$1`,
    [customerId]
  );
  return rows[0];
}

async function newQuote(c, { customerId, ownerId }) {
  const { rows } = await c.query(
    `INSERT INTO quotations (quote_number, customer_id, owner_user_id, status, current_version_number)
     VALUES ($1,$2,$3,'draft',1) RETURNING *`,
    [quoteNumber(), customerId, ownerId]
  );
  return rows[0];
}

// ─── Quote 1: DRAFT — rep edits live during the demo ─────────────────────────
// Within-limit discounts so rep can bump them during the demo to trigger approval
{
  const result = await inTransaction(async (c) => {
    const quote    = await newQuote(c, { customerId: acmeId, ownerId: repId });
    const customer = await fullCustomer(c, acmeId);
    await createQuoteVersion(c, {
      quotation: quote, customer, actorUserId: repId, versionNumber: 1,
      input: {
        customerId: acmeId, discountMode: 'line', currencyCode: 'USD',
        reason: 'Initial draft — bump service discount live to trigger approval',
        lines: [
          { productId: laptopId, quantity: 2, lineDiscountPercent: 10 },
          { productId: dockId,   quantity: 1, lineDiscountPercent: 5  },
        ],
      },
    });
    return quote;
  });
  console.log(`✓ Quote 1  DRAFT                   ${result.quote_number}  (Acme Corp, 2×Laptop + 1×Dock, safe discounts)`);
}

// ─── Quote 2: PENDING MANAGER APPROVAL ───────────────────────────────────────
// Laptop 22% (ceiling 15%) + Service 18% (ceiling 10%) → blended ~7.2% → manager_then_finance
{
  const result = await inTransaction(async (c) => {
    const quote    = await newQuote(c, { customerId: acmeId, ownerId: repId });
    const customer = await fullCustomer(c, acmeId);
    const { version, assessment } = await createQuoteVersion(c, {
      quotation: quote, customer, actorUserId: repId, versionNumber: 1,
      input: {
        customerId: acmeId, discountMode: 'line', currencyCode: 'USD',
        reason: 'Enterprise bundle — aggressive discounts for key account',
        lines: [
          { productId: laptopId, quantity: 5, lineDiscountPercent: 22 },
          { productId: setupId,  quantity: 2, lineDiscountPercent: 18 },
        ],
      },
    });
    await routeApproval(c, { quotation: quote, version, assessment, actorUserId: repId });
    return { quote, blended: assessment.blended_risk_percent, route: assessment.route };
  });
  console.log(`✓ Quote 2  PENDING MANAGER          ${result.quote.quote_number}  (blended ${parseFloat(result.blended).toFixed(1)}% → ${result.route})`);
}

// ─── Quote 3: PENDING FINANCE APPROVAL (manager already approved) ─────────────
{
  const result = await inTransaction(async (c) => {
    const quote    = await newQuote(c, { customerId: betaId, ownerId: repId });
    const customer = await fullCustomer(c, betaId);
    const { version, assessment } = await createQuoteVersion(c, {
      quotation: quote, customer, actorUserId: repId, versionNumber: 1,
      input: {
        customerId: betaId, discountMode: 'line', currencyCode: 'USD',
        reason: 'Beta Industries service bundle — escalated to finance',
        lines: [
          { productId: laptopId, quantity: 3, lineDiscountPercent: 20 },
          { productId: setupId,  quantity: 3, lineDiscountPercent: 20 },
        ],
      },
    });
    await routeApproval(c, { quotation: quote, version, assessment, actorUserId: repId });

    // Approve the manager step
    const { rows: instances } = await c.query(
      `SELECT * FROM approval_instances WHERE quotation_id=$1 ORDER BY sequence_number`,
      [quote.id]
    );
    await c.query(
      `UPDATE approval_instances SET status='approved', decided_at=now(), decision_by_user_id=$1 WHERE id=$2`,
      [managerId, instances[0].id]
    );
    // Create the finance instance (sequential route: finance created only after manager approves)
    await c.query(
      `INSERT INTO approval_instances
         (quotation_id, quotation_version_id, risk_assessment_id, sequence_number, required_role, status)
       VALUES ($1,$2,$3,2,'finance_operations','pending')`,
      [quote.id, version.id, assessment.id]
    );
    await c.query(
      `UPDATE quotations SET status='pending_finance_approval', updated_at=now() WHERE id=$1`,
      [quote.id]
    );
    return { quote, blended: assessment.blended_risk_percent };
  });
  console.log(`✓ Quote 3  PENDING FINANCE          ${result.quote.quote_number}  (manager ✓, finance next — blended ${parseFloat(result.blended).toFixed(1)}%)`);
}

// ─── Quote 4: APPROVED + FULFILLMENT (warehouse split + hybrid billing) ───────
// 5 laptops → MAIN has 3, EAST has 4 → allocate 3 from MAIN + 2 from EAST
// + 1 recurring support line (hybrid billing demo)
{
  const result = await inTransaction(async (c) => {
    const quote    = await newQuote(c, { customerId: acmeId, ownerId: repId });
    const customer = await fullCustomer(c, acmeId);
    const { version, assessment } = await createQuoteVersion(c, {
      quotation: quote, customer, actorUserId: repId, versionNumber: 1,
      input: {
        customerId: acmeId, discountMode: 'line', currencyCode: 'USD',
        reason: 'Approved deal — warehouse split + hybrid billing demo',
        lines: [
          { productId: laptopId,  quantity: 5, lineDiscountPercent: 10 }, // one-time
          { productId: supportId, quantity: 1, lineDiscountPercent: 0  }, // recurring
        ],
      },
    });
    // 10% discount on laptop for Gold customer is within ceiling → blended risk = 0 → auto-approved
    await routeApproval(c, { quotation: quote, version, assessment, actorUserId: repId });
    // Force approved status in case blended is non-zero
    await c.query(`UPDATE quotations SET status='approved', updated_at=now() WHERE id=$1`, [quote.id]);

    // Get the laptop quotation_line id for allocations
    const { rows: qlines } = await c.query(
      `SELECT id, product_id FROM quotation_lines WHERE quotation_version_id=$1 ORDER BY line_number`,
      [version.id]
    );
    const laptopLineId = qlines.find((l) => l.product_id === laptopId)?.id;

    // Create fulfillment order
    const { rows: foRows } = await c.query(
      `INSERT INTO fulfillment_orders (quotation_id, status, allocation_mode)
       VALUES ($1,'allocated','suggested') RETURNING *`,
      [quote.id]
    );
    const fo = foRows[0];

    // Split 5 laptops: 3 from MAIN, 2 from EAST
    for (const [wh, qty] of [[mainWhId, 3], [eastWhId, 2]]) {
      await c.query(
        `INSERT INTO fulfillment_allocations
           (fulfillment_order_id, quotation_line_id, warehouse_id, quantity, status)
         VALUES ($1,$2,$3,$4,'allocated')`,
        [fo.id, laptopLineId, wh, qty]
      );
      await c.query(
        `UPDATE inventory_levels SET quantity_reserved=quantity_reserved+$1
         WHERE warehouse_id=$2 AND product_id=$3`,
        [qty, wh, laptopId]
      );
    }
    return { quote, fo };
  });
  console.log(`✓ Quote 4  APPROVED + FULFILLMENT   ${result.quote.quote_number}  (5 laptops → MAIN×3 + EAST×2, + recurring support line)`);
}

// ─── Quote 5: FULLY PAID (end-state demo) ────────────────────────────────────
{
  const result = await inTransaction(async (c) => {
    const quote    = await newQuote(c, { customerId: acmeId, ownerId: repId });
    const customer = await fullCustomer(c, acmeId);
    const { version, assessment } = await createQuoteVersion(c, {
      quotation: quote, customer, actorUserId: repId, versionNumber: 1,
      input: {
        customerId: acmeId, discountMode: 'line', currencyCode: 'USD',
        reason: 'Completed deal — shows paid invoice end state',
        lines: [
          { productId: laptopId, quantity: 1, lineDiscountPercent: 5 },
          { productId: dockId,   quantity: 1, lineDiscountPercent: 5 },
        ],
      },
    });
    await routeApproval(c, { quotation: quote, version, assessment, actorUserId: repId });
    await c.query(`UPDATE quotations SET status='approved', updated_at=now() WHERE id=$1`, [quote.id]);

    const grandTotal = parseFloat(version.grand_total);
    const invNumber  = `INV-DEMO-${Date.now()}`;

    const { rows: invRows } = await c.query(
      `INSERT INTO invoices
         (invoice_number, quotation_id, customer_id, currency_code, amount_due, amount_paid, status, due_at, issued_at)
       VALUES ($1,$2,$3,'USD',$4,$4,'paid', now()+'30 days', now()) RETURNING *`,
      [invNumber, quote.id, acmeId, grandTotal]
    );
    const invoice = invRows[0];

    await c.query(
      `INSERT INTO payments (invoice_id, amount, payment_method, external_reference, paid_at)
       VALUES ($1,$2,'bank_transfer','WIRE-DEMO-001',now())`,
      [invoice.id, grandTotal]
    );
    await c.query(`UPDATE quotations SET status='paid', updated_at=now() WHERE id=$1`, [quote.id]);

    return { quote, invoice };
  });
  console.log(`✓ Quote 5  PAID                     ${result.quote.quote_number}  (invoice ${result.invoice.invoice_number} fully paid)`);
}

await client.release();
await pool.end();

console.log(`
Demo data is ready. Two terminals to run:
  npm run dev               (backend  → http://localhost:3001)
  cd frontend && npm run dev (frontend → http://localhost:3000)

Login accounts:
  rep@dealflow360.local      ChangeMe123!  → sees Quote 1 (draft to submit live)
  manager@dealflow360.local  ChangeMe123!  → sees Quote 2 in approval queue
  finance@dealflow360.local  ChangeMe123!  → sees Quote 3 (manager already approved)
`);
