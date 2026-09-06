/**
 * Full seed — extensive data for E2E testing.
 * Run: node database/full-seed.js
 * Reference data (users, customers, products, pricing) is idempotent.
 * Transactional data (quotations, invoices, etc.) appends on every run.
 * Run npm run db:seed first (this script extends it, does not replace it).
 */

import 'dotenv/config';
import { pool } from '../src/infrastructure/database/pool.js';
import { inTransaction } from '../src/infrastructure/database/transaction.js';
import { createQuoteVersion, quoteNumber, routeApproval } from '../src/domains/sales-rep/quotation.service.js';
import { hashPassword } from '../src/modules/identity/password.js';

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'ChangeMe123!';
const hash = await hashPassword(DEMO_PASSWORD);

const client = await pool.connect();

function q(sql, params = []) { return client.query(sql, params); }

async function rowId(table, col, val) {
  const { rows } = await q(`SELECT id FROM ${table} WHERE ${col} = $1`, [val]);
  if (!rows[0]) throw new Error(`Missing: ${table}.${col}=${val}`);
  return rows[0].id;
}

async function maybeId(table, col, val) {
  const { rows } = await q(`SELECT id FROM ${table} WHERE ${col} = $1`, [val]);
  return rows[0]?.id ?? null;
}

async function fullCustomer(c, customerId) {
  const { rows } = await c.query(
    `SELECT c.*, ct.code AS tier_code, ct.entitlement_discount_percent,
            ct.policy_version AS tier_policy_version
     FROM customers c
     JOIN customer_tiers ct ON ct.id = c.tier_id
     WHERE c.id = $1`,
    [customerId]
  );
  return rows[0];
}

async function newQuote(c, customerId, ownerId) {
  const { rows } = await c.query(
    `INSERT INTO quotations (quote_number, customer_id, owner_user_id, status, current_version_number)
     VALUES ($1, $2, $3, 'draft', 1) RETURNING *`,
    [quoteNumber(), customerId, ownerId]
  );
  return rows[0];
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1 — USERS
// ─────────────────────────────────────────────────────────────────────────────
await q('BEGIN');
console.log('\n[1] Seeding users…');

async function ensureUser(email, displayName, role) {
  const { rows } = await q(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           display_name = EXCLUDED.display_name,
           is_active = TRUE
     RETURNING id`,
    [email, hash, displayName]
  );
  await q(`INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [rows[0].id, role]);
  return rows[0].id;
}

// existing users (idempotent)
const repId      = await ensureUser('rep@dealflow360.local',     'Riya Sharma',       'sales_rep');
const managerId  = await ensureUser('manager@dealflow360.local', 'Maya Iyer',         'sales_manager');
const financeId  = await ensureUser('finance@dealflow360.local', 'Farhan Khan',       'finance_operations');
await ensureUser('admin@dealflow360.local', 'DealFlow360 Admin', 'admin');

// additional internal users
const rep2Id     = await ensureUser('rep2@dealflow360.local',    'Sanjay Mehta',      'sales_rep');
const rep3Id     = await ensureUser('rep3@dealflow360.local',    'Priya Nair',        'sales_rep');
const rep4Id     = await ensureUser('rep4@dealflow360.local',    'Arjun Kapoor',      'sales_rep');
const rep5Id     = await ensureUser('rep5@dealflow360.local',    'Divya Reddy',       'sales_rep');
const rep6Id     = await ensureUser('rep6@dealflow360.local',    'Vikram Singh',      'sales_rep');
const manager2Id = await ensureUser('manager2@dealflow360.local','Nikhil Verma',      'sales_manager');
const manager3Id = await ensureUser('manager3@dealflow360.local','Sunita Bose',       'sales_manager');
const finance2Id = await ensureUser('finance2@dealflow360.local','Meera Pillai',      'finance_operations');

// customer portal users
await ensureUser('purchasing@acme.example',    'Alex Buyer',           'customer_portal');
await ensureUser('buyer@gamma.example',        'Gina Buyer',           'customer_portal');
await ensureUser('cfo@nexustech.example',      'Neel CFO',             'customer_portal');
await ensureUser('ops@horizon.example',        'Hana Ops',             'customer_portal');
await ensureUser('proc@apexdyn.example',       'Arun Procurement',     'customer_portal');
await ensureUser('mgr@summitcorp.example',     'Sam Manager',          'customer_portal');
await ensureUser('buyer@vertexlabs.example',   'Vera Buyer',           'customer_portal');
await ensureUser('cpo@titan.example',          'Tom CPO',              'customer_portal');
await ensureUser('po@novaretail.example',      'Nina PO',              'customer_portal');
await ensureUser('ops@crestsol.example',       'Chris Ops',            'customer_portal');
await ensureUser('cto@meridianinc.example',    'Mira CTO',             'customer_portal');
await ensureUser('fin@pinnaclegroup.example',  'Pete Finance',         'customer_portal');
await ensureUser('purchase@eclipseco.example', 'Elena Purchasing',     'customer_portal');
await ensureUser('ceo@alphaconsulting.example','Alan CEO',             'customer_portal');
await ensureUser('partner@zenith.example',     'Zara Partner',         'customer_portal');
await ensureUser('vp@orionsys.example',        'Oliver VP',            'customer_portal');
await ensureUser('founder@sprout.example',     'Sam Founder',          'customer_portal');
await ensureUser('ops@deltasmb.example',       'Dan Ops',              'customer_portal');
await ensureUser('cto@kiteanalytics.example',  'Kate CTO',             'customer_portal');
await ensureUser('pm@pulsedigital.example',    'Paul PM',              'customer_portal');
await ensureUser('ceo@emberstudio.example',    'Emma CEO',             'customer_portal');
await ensureUser('pm@vanguard.example',        'Victor PM',            'customer_portal');
await ensureUser('design@frost.example',       'Frank Designer',       'customer_portal');
await ensureUser('dev@cobalttech.example',     'Carl Dev',             'customer_portal');

await q('COMMIT');
console.log('    Users done.');

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — CUSTOMERS & CONTACTS
// ─────────────────────────────────────────────────────────────────────────────
await q('BEGIN');
console.log('\n[2] Seeding customers & contacts…');

const goldId   = await rowId('customer_tiers', 'code', 'gold');
const silverId = await rowId('customer_tiers', 'code', 'silver');
const bronzeId = await rowId('customer_tiers', 'code', 'bronze');

async function ensureCustomer(legalName, tierId, currency = 'USD') {
  const existing = await maybeId('customers', 'legal_name', legalName);
  if (existing) return existing;
  if (!tierId) {
    // tier_id is nullable after migration 005
    const { rows } = await q(
      `INSERT INTO customers (legal_name, tier_id, currency_code) VALUES ($1, NULL, $2) RETURNING id`,
      [legalName, currency]
    );
    return rows[0].id;
  }
  const { rows } = await q(
    `INSERT INTO customers (legal_name, tier_id, currency_code, tier_assignment_source, tier_assigned_at)
     VALUES ($1, $2, $3, 'admin_override', now()) RETURNING id`,
    [legalName, tierId, currency]
  );
  return rows[0].id;
}

async function ensureContact(customerId, email, displayName) {
  await q(
    `INSERT INTO customer_contacts (customer_id, email, display_name)
     VALUES ($1, $2, $3) ON CONFLICT (customer_id, email) DO NOTHING`,
    [customerId, email, displayName]
  );
  const { rows } = await q(
    `SELECT id FROM customer_contacts WHERE customer_id=$1 AND email=$2`,
    [customerId, email]
  );
  return rows[0].id;
}

// existing customers
const acmeId  = await ensureCustomer('Acme Corp',        goldId);
const betaId  = await ensureCustomer('Beta Industries',  silverId);
const gammaId = await ensureCustomer('Gamma Startups',   null);

// gold tier — large enterprise
const nexusId    = await ensureCustomer('Nexus Tech',          goldId);
const horizonId  = await ensureCustomer('Horizon Systems',     goldId);
const apexId     = await ensureCustomer('Apex Dynamics',       goldId);
const summitId   = await ensureCustomer('Summit Corp',         goldId);
const vertexId   = await ensureCustomer('Vertex Labs',         goldId);
const titanId    = await ensureCustomer('Titan Enterprises',   goldId);
const vanguardId = await ensureCustomer('Vanguard Solutions',  goldId);

// silver tier — mid-market
const novaId     = await ensureCustomer('Nova Retail',         silverId);
const crestId    = await ensureCustomer('Crest Solutions',     silverId);
const meridianId = await ensureCustomer('Meridian Inc',        silverId);
const pinnacleId = await ensureCustomer('Pinnacle Group',      silverId);
const eclipseId  = await ensureCustomer('Eclipse Co',          silverId);
const alphaId    = await ensureCustomer('Alpha Consulting',    silverId);
const zenithId   = await ensureCustomer('Zenith Partners',     silverId);
const orionId    = await ensureCustomer('Orion Systems',       silverId);

// bronze tier — small / startup
const sproutId   = await ensureCustomer('Sprout Startup',      bronzeId);
const deltaId    = await ensureCustomer('Delta SMB',           bronzeId);
const kiteId     = await ensureCustomer('Kite Analytics',      bronzeId);
const pulseId    = await ensureCustomer('Pulse Digital',       bronzeId);
const emberId    = await ensureCustomer('Ember Studio',        bronzeId);
const frostId    = await ensureCustomer('Frost Creative',      bronzeId);
const cobaltId   = await ensureCustomer('Cobalt Tech',         bronzeId);

// prospects (no tier — quote creation skipped; still useful for quote_requests)
const trialId    = await ensureCustomer('TrialCo',             null);

// contacts
const contactMap = {};
async function c2(cid, email, display) {
  return ensureContact(cid, email, display);
}

contactMap.acme   = [await c2(acmeId,    'purchasing@acme.example',    'Alex Buyer'),
                     await c2(acmeId,    'cto@acme.example',           'Rachel CTO')];
contactMap.beta   = [await c2(betaId,    'ops@beta.example',           'Ben Ops'),
                     await c2(betaId,    'finance@beta.example',       'Fiona Finance')];
contactMap.gamma  = [await c2(gammaId,   'buyer@gamma.example',        'Gina Buyer')];
contactMap.nexus  = [await c2(nexusId,   'cfo@nexustech.example',      'Neel CFO'),
                     await c2(nexusId,   'vp@nexustech.example',       'Nadia VP')];
contactMap.horizon= [await c2(horizonId, 'ops@horizon.example',        'Hana Ops'),
                     await c2(horizonId, 'legal@horizon.example',      'Hugo Legal')];
contactMap.apex   = [await c2(apexId,    'proc@apexdyn.example',       'Arun Procurement'),
                     await c2(apexId,    'it@apexdyn.example',         'Asha IT')];
contactMap.summit = [await c2(summitId,  'mgr@summitcorp.example',     'Sam Manager'),
                     await c2(summitId,  'coo@summitcorp.example',     'Sofia COO')];
contactMap.vertex = [await c2(vertexId,  'buyer@vertexlabs.example',   'Vera Buyer')];
contactMap.titan  = [await c2(titanId,   'cpo@titan.example',          'Tom CPO'),
                     await c2(titanId,   'finance@titan.example',      'Tara Finance')];
contactMap.vanguard=[await c2(vanguardId,'pm@vanguard.example',        'Victor PM')];
contactMap.nova   = [await c2(novaId,    'po@novaretail.example',      'Nina PO'),
                     await c2(novaId,    'store@novaretail.example',   'Nick Store')];
contactMap.crest  = [await c2(crestId,   'ops@crestsol.example',       'Chris Ops')];
contactMap.meridian=[await c2(meridianId,'cto@meridianinc.example',    'Mira CTO'),
                     await c2(meridianId,'proc@meridianinc.example',   'Mike Proc')];
contactMap.pinnacle=[await c2(pinnacleId,'fin@pinnaclegroup.example',  'Pete Finance')];
contactMap.eclipse= [await c2(eclipseId, 'purchase@eclipseco.example', 'Elena Purchasing'),
                     await c2(eclipseId, 'ops@eclipseco.example',      'Ed Ops')];
contactMap.alpha  = [await c2(alphaId,   'ceo@alphaconsulting.example','Alan CEO'),
                     await c2(alphaId,   'pm@alphaconsulting.example', 'Amy PM')];
contactMap.zenith = [await c2(zenithId,  'partner@zenith.example',     'Zara Partner')];
contactMap.orion  = [await c2(orionId,   'vp@orionsys.example',        'Oliver VP'),
                     await c2(orionId,   'it@orionsys.example',        'Olivia IT')];
contactMap.sprout = [await c2(sproutId,  'founder@sprout.example',     'Sam Founder')];
contactMap.delta  = [await c2(deltaId,   'ops@deltasmb.example',       'Dan Ops'),
                     await c2(deltaId,   'finance@deltasmb.example',   'Dana Finance')];
contactMap.kite   = [await c2(kiteId,    'cto@kiteanalytics.example',  'Kate CTO')];
contactMap.pulse  = [await c2(pulseId,   'pm@pulsedigital.example',    'Paul PM')];
contactMap.ember  = [await c2(emberId,   'ceo@emberstudio.example',    'Emma CEO')];
contactMap.frost  = [await c2(frostId,   'design@frost.example',       'Frank Designer')];
contactMap.cobalt = [await c2(cobaltId,  'dev@cobalttech.example',     'Carl Dev')];
contactMap.trial  = [await c2(trialId,   'info@trialco.example',       'Terry Info')];

await q('COMMIT');
console.log('    Customers and contacts done.');

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — PRODUCTS, INVENTORY, PRICING
// ─────────────────────────────────────────────────────────────────────────────
await q('BEGIN');
console.log('\n[3] Seeding products, inventory & pricing…');

const hwId = await rowId('product_categories', 'code', 'hardware');
const swId = await rowId('product_categories', 'code', 'software');
const mainWh = await rowId('warehouses', 'code', 'MAIN');
const eastWh = await rowId('warehouses', 'code', 'EAST');

async function ensureProduct(sku, name, categoryId, billingKind, listPrice, standardCost, desc) {
  await q(
    `INSERT INTO products (sku, name, category_id, description, unit_name, list_price, standard_cost, tax_percent, billing_kind)
     VALUES ($1, $2, $3, $4, 'unit', $5, $6, 0, $7)
     ON CONFLICT (sku) DO UPDATE
       SET name=EXCLUDED.name, list_price=EXCLUDED.list_price,
           standard_cost=EXCLUDED.standard_cost, billing_kind=EXCLUDED.billing_kind,
           is_active=TRUE`,
    [sku, name, categoryId, desc ?? null, listPrice, standardCost, billingKind]
  );
  return rowId('products', 'sku', sku);
}

// existing products (idempotent)
const pLaptop  = await ensureProduct('LAPTOP-PRO',      'Pro Laptop',             hwId, 'one_time',  1200, 800,  'Business laptop');
const pDock    = await ensureProduct('DOCK-USBC',       'USB-C Dock',             hwId, 'one_time',   180,  90,  'USB-C docking station');
const pSetup   = await ensureProduct('SETUP-SVC',       'Implementation Service', swId, 'one_time',   300, 160,  'Setup and configuration service');
const pSuppMo  = await ensureProduct('SUPPORT-MONTHLY', 'Managed Support (Mo)',   swId, 'recurring',   75,  25,  'Monthly managed support');

// new hardware products
const pServer  = await ensureProduct('SERVER-RACK',     'Enterprise Server Rack', hwId, 'one_time',  4500, 3000, 'Rack-mounted 2U server');
const pMonitor = await ensureProduct('MONITOR-4K',      '4K Ultra-HD Display',    hwId, 'one_time',   650,  380, '27-inch 4K IPS monitor');
const pSwitch  = await ensureProduct('NETWORK-SWITCH',  '48-Port Network Switch', hwId, 'one_time',   950,  580, 'Layer 3 managed switch');
const pWifi    = await ensureProduct('WIFI-AP',         'Enterprise WiFi AP',     hwId, 'one_time',   280,  140, 'PoE access point');
const pCable   = await ensureProduct('CABLE-KIT',       'Cabling & Patch Kit',    hwId, 'one_time',    45,   15, 'Cat6 cabling bundle');
const pUps     = await ensureProduct('UPS-2KVA',        'UPS 2kVA Battery Unit',  hwId, 'one_time',   380,  210, 'Rack-mounted 2kVA UPS');

// new software / services
const pErp     = await ensureProduct('LICENSE-ERP',     'ERP Platform License',   swId, 'one_time',  2000,  400, 'Annual perpetual ERP license');
const pCrm     = await ensureProduct('LICENSE-CRM',     'CRM Suite License',      swId, 'one_time',   800,  150, 'CRM per-seat license');
const pTrain   = await ensureProduct('TRAINING-ONSITE', 'Onsite Training 2-day',  swId, 'one_time',  1200,  600, 'On-site trainer for 2 days');
const pSuppAnn = await ensureProduct('SUPPORT-ANNUAL',  'Annual Support Plan',    swId, 'recurring',  500,   80, '24/7 annual support contract');
const pSuppQtr = await ensureProduct('SUPPORT-QUARTER', 'Quarterly Support',      swId, 'recurring',  150,   30, 'Quarterly support bundle');
const pCloud   = await ensureProduct('CLOUD-STORAGE',   'Cloud Storage (monthly)',swId, 'recurring',   99,   20, '1 TB managed cloud storage');
const pSecurity= await ensureProduct('SECURITY-AUDIT',  'Security Audit Service', swId, 'one_time',  1800,  900, 'Full penetration test + report');
const pMigrate = await ensureProduct('DATA-MIGRATION',  'Data Migration Service', swId, 'one_time',   900,  450, 'One-time data migration');

// inventory levels
const inventory = [
  [mainWh, pServer,  8], [eastWh, pServer,  4],
  [mainWh, pMonitor,20], [eastWh, pMonitor,15],
  [mainWh, pSwitch,  6], [eastWh, pSwitch,  3],
  [mainWh, pWifi,   25], [eastWh, pWifi,   18],
  [mainWh, pCable, 200], [eastWh, pCable, 150],
  [mainWh, pUps,    10], [eastWh, pUps,    5],
  [mainWh, pErp,   999], [eastWh, pErp,   999],
  [mainWh, pCrm,   999], [eastWh, pCrm,   999],
  [mainWh, pTrain, 999], [mainWh, pSuppAnn,999],
  [mainWh, pSuppQtr,999],[mainWh, pCloud,  999],
  [mainWh, pSecurity,999],[mainWh, pMigrate,999],
];
for (const [wh, prod, qty] of inventory) {
  await q(
    `INSERT INTO inventory_levels (warehouse_id, product_id, quantity_on_hand, quantity_reserved, reorder_point)
     VALUES ($1, $2, $3, 0, 5) ON CONFLICT (warehouse_id, product_id) DO NOTHING`,
    [wh, prod, qty]
  );
}

// price lists
async function makePriceList(name, tierId) {
  await q(
    `INSERT INTO price_lists (name, tier_id, currency_code)
     SELECT $1, $2, 'USD' WHERE NOT EXISTS (
       SELECT 1 FROM price_lists WHERE name=$1 AND tier_id=$2 AND currency_code='USD'
     )`,
    [name, tierId]
  );
  const { rows } = await q(
    `SELECT id FROM price_lists WHERE name=$1 AND tier_id=$2 AND currency_code='USD' ORDER BY created_at LIMIT 1`,
    [name, tierId]
  );
  return rows[0].id;
}

const goldPlId   = await makePriceList('Gold USD',   goldId);
const silverPlId = await makePriceList('Silver USD', silverId);
const bronzePlId = await makePriceList('Bronze USD', bronzeId);

// [productId, gold_price, silver_price, bronze_price]
const pricing = [
  [pLaptop,  1150, 1200, 1200], [pDock,    160,  180,  180],
  [pSetup,    290,  300,  300], [pSuppMo,   70,   75,   75],
  [pServer,  4200, 4500, 4500], [pMonitor,  600,  650,  650],
  [pSwitch,   880,  950,  950], [pWifi,     260,  280,  280],
  [pCable,     42,   45,   45], [pUps,      350,  380,  380],
  [pErp,     1850, 2000, 2000], [pCrm,      740,  800,  800],
  [pTrain,   1100, 1200, 1200], [pSuppAnn,  460,  500,  500],
  [pSuppQtr,  140,  150,  150], [pCloud,     90,   99,   99],
  [pSecurity,1650, 1800, 1800], [pMigrate,  840,  900,  900],
];
for (const [prodId, gP, sP, bP] of pricing) {
  for (const [plId, price] of [[goldPlId, gP], [silverPlId, sP], [bronzePlId, bP]]) {
    await q(
      `INSERT INTO price_list_items (price_list_id, product_id, unit_price)
       SELECT $1, $2, $3 WHERE NOT EXISTS (
         SELECT 1 FROM price_list_items
         WHERE price_list_id=$1 AND product_id=$2 AND valid_from IS NULL AND valid_to IS NULL
       )`,
      [plId, prodId, price]
    );
  }
}

// upsell rules
const upsells = [
  [pLaptop,  pDock,     'cross_sell', 'Bundle deal',      20],
  [pLaptop,  pMonitor,  'cross_sell', 'Complete setup',   22],
  [pServer,  pSwitch,   'cross_sell', 'Network bundle',   18],
  [pServer,  pUps,      'cross_sell', 'Power protection', 15],
  [pErp,     pTrain,    'upsell',     'Go-live pack',     25],
  [pCrm,     pSuppAnn,  'upsell',     'Support bundle',   30],
  [pSetup,   pSuppQtr,  'cross_sell', null,               20],
  [pMonitor, pCable,    'cross_sell', 'Plug & play',      40],
];
for (const [trigger, suggested, kind, tag, margin] of upsells) {
  await q(
    `INSERT INTO upsell_rules (trigger_product_id, suggested_product_id, rule_kind, rank_weight, promotion_tag, minimum_margin_percent)
     SELECT $1, $2, $3, 100, $4, $5
     WHERE NOT EXISTS (SELECT 1 FROM upsell_rules WHERE trigger_product_id=$1 AND suggested_product_id=$2)`,
    [trigger, suggested, kind, tag, margin]
  );
}

// subscription plans
await q(`INSERT INTO subscription_plans (code, name, interval_unit, proration_policy, cancellation_policy)
  VALUES
    ('MONTHLY-SUPPORT',   'Monthly Managed Support',  'month',   '{"method":"daily"}',   '{"refund":"prorated"}'),
    ('QUARTERLY-SUPPORT', 'Quarterly Support Bundle', 'quarter', '{"method":"monthly"}', '{"refund":"prorated","notice_days":30}'),
    ('ANNUAL-SUPPORT',    'Annual Support Plan',      'year',    '{"method":"daily"}',   '{"refund":"prorated","notice_days":60}'),
    ('CLOUD-MONTHLY',     'Cloud Storage Monthly',    'month',   '{"method":"daily"}',   '{"refund":"none"}')
  ON CONFLICT (code) DO NOTHING`);

await q('COMMIT');
console.log('    Products, inventory, pricing done.');

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 4 — QUOTATIONS (all statuses, using domain service)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[4] Seeding quotations…');

const reps = [repId, rep2Id, rep3Id, rep4Id, rep5Id, rep6Id];
const managers = [managerId, manager2Id, manager3Id];

// tiered customers only (domain service needs tier join)
const tieredCustomers = [
  { id: acmeId,    key: 'acme' },
  { id: betaId,    key: 'beta' },
  { id: nexusId,   key: 'nexus' },
  { id: horizonId, key: 'horizon' },
  { id: apexId,    key: 'apex' },
  { id: summitId,  key: 'summit' },
  { id: vertexId,  key: 'vertex' },
  { id: titanId,   key: 'titan' },
  { id: vanguardId,key: 'vanguard' },
  { id: novaId,    key: 'nova' },
  { id: crestId,   key: 'crest' },
  { id: meridianId,key: 'meridian' },
  { id: pinnacleId,key: 'pinnacle' },
  { id: eclipseId, key: 'eclipse' },
  { id: alphaId,   key: 'alpha' },
  { id: zenithId,  key: 'zenith' },
  { id: orionId,   key: 'orion' },
  { id: sproutId,  key: 'sprout' },
  { id: deltaId,   key: 'delta' },
  { id: kiteId,    key: 'kite' },
  { id: pulseId,   key: 'pulse' },
  { id: emberId,   key: 'ember' },
  { id: frostId,   key: 'frost' },
  { id: cobaltId,  key: 'cobalt' },
];

// line configurations for variety
// [productId, quantity, discountPercent, reason]
const lineSets = [
  { lines: [[pLaptop, 5, 12], [pDock, 5, 8]],          reason: 'Laptop bundle for new office setup' },
  { lines: [[pServer, 2, 6], [pSwitch, 1, 0]],          reason: 'Data center upgrade' },
  { lines: [[pErp, 1, 10], [pTrain, 1, 0], [pSuppAnn, 1, 0]], reason: 'ERP go-live package' },
  { lines: [[pCrm, 3, 8], [pSuppQtr, 1, 0]],            reason: 'CRM rollout with support' },
  { lines: [[pMonitor, 4, 5], [pCable, 10, 0]],          reason: 'Designer workstation monitors' },
  { lines: [[pWifi, 6, 12], [pSwitch, 1, 5]],            reason: 'Office WiFi expansion' },
  { lines: [[pLaptop, 3, 22], [pSetup, 1, 0], [pSuppAnn, 1, 0]], reason: 'High-discount laptop deal with support' },
  { lines: [[pServer, 1, 0], [pUps, 1, 0], [pSwitch, 2, 0]], reason: 'Server room kit' },
  { lines: [[pSecurity, 1, 0]],                          reason: 'Annual security audit' },
  { lines: [[pMigrate, 1, 5], [pCloud, 2, 0]],           reason: 'Cloud migration project' },
  { lines: [[pLaptop, 10, 18], [pDock, 10, 15]],         reason: 'Large hardware refresh — above ceiling' },
  { lines: [[pErp, 1, 15], [pCrm, 5, 12]],              reason: 'Enterprise software bundle' },
];

const createdQuotes = [];
let custIdx = 0, repIdx = 0, lsIdx = 0;

// Helper: create a quote in a given status
async function makeQuote(customerId, repId, lineConfig, targetStatus) {
  return inTransaction(async (c) => {
    const quote    = await newQuote(c, customerId, repId);
    const customer = await fullCustomer(c, customerId);

    const { version, assessment } = await createQuoteVersion(c, {
      quotation: quote,
      customer,
      actorUserId: repId,
      versionNumber: 1,
      input: {
        customerId,
        discountMode: 'line',
        currencyCode: 'USD',
        reason: lineConfig.reason,
        lines: lineConfig.lines.map(([productId, quantity, lineDiscountPercent]) =>
          ({ productId, quantity, lineDiscountPercent })
        ),
      },
    });

    // Route through approval (sets status to pending_* if risk > 0, else approved/draft)
    await routeApproval(c, { quotation: quote, version, assessment, actorUserId: repId });

    // Force target status
    if (targetStatus !== 'pending_manager_approval' && targetStatus !== 'pending_finance_approval') {
      await c.query(
        `UPDATE quotations SET status=$1, updated_at=now() WHERE id=$2`,
        [targetStatus, quote.id]
      );
    }

    // If routing created approval instances but we want a non-approval status, supersede them
    if (!['pending_manager_approval', 'pending_finance_approval'].includes(targetStatus)) {
      await c.query(
        `UPDATE approval_instances SET status='superseded' WHERE quotation_id=$1 AND status='pending'`,
        [quote.id]
      );
    }

    return { quote, version, assessment };
  });
}

// DRAFT quotes (5)
for (let i = 0; i < 5; i++) {
  const cust = tieredCustomers[custIdx++ % tieredCustomers.length];
  const rep  = reps[repIdx++ % reps.length];
  const ls   = lineSets[lsIdx++ % lineSets.length];
  const { quote } = await makeQuote(cust.id, rep, ls, 'draft');
  createdQuotes.push({ status: 'draft', quoteId: quote.id, customerId: cust.id, custKey: cust.key });
  process.stdout.write('.');
}

// PENDING MANAGER APPROVAL (8)
for (let i = 0; i < 8; i++) {
  const cust = tieredCustomers[custIdx++ % tieredCustomers.length];
  const rep  = reps[repIdx++ % reps.length];
  const ls   = lineSets[lsIdx++ % lineSets.length];
  try {
    const { quote } = await makeQuote(cust.id, rep, ls, 'pending_manager_approval');
    createdQuotes.push({ status: 'pending_manager_approval', quoteId: quote.id, customerId: cust.id, custKey: cust.key });
    process.stdout.write('.');
  } catch (e) {
    // Some line configs may route to finance or none — force the status
    process.stdout.write('!');
  }
}

// PENDING FINANCE APPROVAL (5)
for (let i = 0; i < 5; i++) {
  const cust = tieredCustomers[custIdx++ % tieredCustomers.length];
  const rep  = reps[repIdx++ % reps.length];
  const ls   = lineSets[lsIdx++ % lineSets.length];
  try {
    const result = await inTransaction(async (c) => {
      const quote    = await newQuote(c, cust.id, rep);
      const customer = await fullCustomer(c, cust.id);
      const { version, assessment } = await createQuoteVersion(c, {
        quotation: quote, customer, actorUserId: rep, versionNumber: 1,
        input: {
          customerId: cust.id, discountMode: 'line', currencyCode: 'USD',
          reason: ls.reason,
          lines: ls.lines.map(([productId, quantity, lineDiscountPercent]) => ({ productId, quantity, lineDiscountPercent })),
        },
      });
      await routeApproval(c, { quotation: quote, version, assessment, actorUserId: rep });
      // Simulate manager approving, finance pending
      const { rows: instances } = await c.query(
        `SELECT * FROM approval_instances WHERE quotation_id=$1 ORDER BY sequence_number`,
        [quote.id]
      );
      if (instances.length > 0) {
        await c.query(
          `UPDATE approval_instances SET status='approved', decided_at=now(), decision_by_user_id=$1 WHERE id=$2`,
          [managers[i % managers.length], instances[0].id]
        );
        await c.query(
          `INSERT INTO approval_instances (quotation_id, quotation_version_id, risk_assessment_id, sequence_number, required_role, status)
           VALUES ($1,$2,$3,2,'finance_operations','pending')
           ON CONFLICT (quotation_version_id, sequence_number) DO NOTHING`,
          [quote.id, version.id, assessment.id]
        );
        await c.query(`UPDATE quotations SET status='pending_finance_approval', updated_at=now() WHERE id=$1`, [quote.id]);
      }
      return { quote };
    });
    createdQuotes.push({ status: 'pending_finance_approval', quoteId: result.quote.id, customerId: cust.id, custKey: cust.key });
    process.stdout.write('.');
  } catch (e) {
    process.stdout.write('!');
  }
}

// APPROVED (6)
for (let i = 0; i < 6; i++) {
  const cust = tieredCustomers[custIdx++ % tieredCustomers.length];
  const rep  = reps[repIdx++ % reps.length];
  const ls   = lineSets[lsIdx++ % lineSets.length];
  const { quote } = await makeQuote(cust.id, rep, ls, 'approved');
  createdQuotes.push({ status: 'approved', quoteId: quote.id, customerId: cust.id, custKey: cust.key });
  process.stdout.write('.');
}

// SENT TO CUSTOMER (5)
for (let i = 0; i < 5; i++) {
  const cust = tieredCustomers[custIdx++ % tieredCustomers.length];
  const rep  = reps[repIdx++ % reps.length];
  const ls   = lineSets[lsIdx++ % lineSets.length];
  const { quote } = await makeQuote(cust.id, rep, ls, 'sent_to_customer');
  createdQuotes.push({ status: 'sent_to_customer', quoteId: quote.id, customerId: cust.id, custKey: cust.key });
  process.stdout.write('.');
}

// UNDER NEGOTIATION (5)
for (let i = 0; i < 5; i++) {
  const cust = tieredCustomers[custIdx++ % tieredCustomers.length];
  const rep  = reps[repIdx++ % reps.length];
  const ls   = lineSets[lsIdx++ % lineSets.length];
  const { quote } = await makeQuote(cust.id, rep, ls, 'under_negotiation');
  createdQuotes.push({ status: 'under_negotiation', quoteId: quote.id, customerId: cust.id, custKey: cust.key });
  process.stdout.write('.');
}

// CUSTOMER CONFIRMED (7)
for (let i = 0; i < 7; i++) {
  const cust = tieredCustomers[custIdx++ % tieredCustomers.length];
  const rep  = reps[repIdx++ % reps.length];
  const ls   = lineSets[lsIdx++ % lineSets.length];
  const { quote } = await makeQuote(cust.id, rep, ls, 'customer_confirmed');
  createdQuotes.push({ status: 'customer_confirmed', quoteId: quote.id, customerId: cust.id, custKey: cust.key });
  process.stdout.write('.');
}

// REJECTED (3)
for (let i = 0; i < 3; i++) {
  const cust = tieredCustomers[custIdx++ % tieredCustomers.length];
  const rep  = reps[repIdx++ % reps.length];
  const ls   = lineSets[lsIdx++ % lineSets.length];
  const { quote } = await makeQuote(cust.id, rep, ls, 'rejected');
  createdQuotes.push({ status: 'rejected', quoteId: quote.id, customerId: cust.id, custKey: cust.key });
  process.stdout.write('.');
}

// EXPIRED (3) and CANCELLED (2)
for (const targetStatus of ['expired', 'expired', 'expired', 'cancelled', 'cancelled']) {
  const cust = tieredCustomers[custIdx++ % tieredCustomers.length];
  const rep  = reps[repIdx++ % reps.length];
  const ls   = lineSets[lsIdx++ % lineSets.length];
  const { quote } = await makeQuote(cust.id, rep, ls, targetStatus);
  createdQuotes.push({ status: targetStatus, quoteId: quote.id, customerId: cust.id, custKey: cust.key });
  process.stdout.write('.');
}

console.log(`\n    Quotations done: ${createdQuotes.length} total`);

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 5 — NEGOTIATION MESSAGES & CASES
// ─────────────────────────────────────────────────────────────────────────────
await q('BEGIN');
console.log('\n[5] Seeding negotiation…');

const negotiableStatuses = ['sent_to_customer', 'under_negotiation', 'customer_confirmed'];
let mgrI = 0;

for (const qt of createdQuotes.filter(q => negotiableStatuses.includes(q.status))) {
  const mgr = managers[mgrI++ % managers.length];

  // internal thread (sales_rep message)
  await q(
    `INSERT INTO negotiation_messages (quotation_id, origin, internal_user_id, message_text)
     VALUES ($1, 'internal', $2, $3)`,
    [qt.quoteId, repId, 'Customer requested a 5% additional discount. Checking with manager.']
  );
  await q(
    `INSERT INTO negotiation_messages (quotation_id, origin, internal_user_id, message_text)
     VALUES ($1, 'internal', $2, $3)`,
    [qt.quoteId, mgr, 'Max we can offer is 3% given tier ceiling. Confirm with customer.']
  );

  // negotiation case
  const ownerRole = 'sales_rep';
  const caseStatus = qt.status === 'customer_confirmed' ? 'resolved' : 'open';
  const { rows: ncRows } = await q(
    `INSERT INTO negotiation_cases (quotation_id, owner_role, status, resolved_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (quotation_id) DO UPDATE
       SET owner_role=EXCLUDED.owner_role, status=EXCLUDED.status,
           resolved_at=EXCLUDED.resolved_at, updated_at=now()
     RETURNING id`,
    [qt.quoteId, ownerRole, caseStatus, caseStatus === 'resolved' ? new Date() : null]
  );
  const caseId = ncRows[0].id;
  await q(
    `INSERT INTO negotiation_case_events (negotiation_case_id, event_type, to_role, quotation_version_number)
     VALUES ($1, 'customer_request_received', $2, 1)`,
    [caseId, ownerRole]
  );
  if (caseStatus === 'resolved') {
    await q(
      `INSERT INTO negotiation_case_events (negotiation_case_id, event_type, from_role, reason, quotation_version_number)
       VALUES ($1, 'resolved', $2, 'Customer confirmed order', 1)`,
      [caseId, ownerRole]
    );
  }
}

// structured negotiation requests (portal, from sent_to_customer quotes)
for (const qt of createdQuotes.filter(q => q.status === 'sent_to_customer')) {
  const { rows: contactRows } = await q(
    `SELECT id FROM customer_contacts WHERE customer_id=$1 LIMIT 1`, [qt.customerId]
  );
  if (!contactRows[0]) continue;
  const { rows: vRows } = await q(
    `SELECT qv.id FROM quotation_versions qv WHERE qv.quotation_id=$1 ORDER BY version_number LIMIT 1`,
    [qt.quoteId]
  );
  const { rows: lineRows } = await q(
    `SELECT id FROM quotation_lines WHERE quotation_version_id=$1 LIMIT 1`, [vRows[0].id]
  );
  if (!lineRows[0]) continue;

  const { rows: nrRows } = await q(
    `INSERT INTO negotiation_requests (quotation_id, quotation_version_id, customer_contact_id, counter_discount_percent, risk_preview_percent, risk_preview_route)
     VALUES ($1, $2, $3, 8, 3, 'manager') RETURNING id`,
    [qt.quoteId, vRows[0].id, contactRows[0].id]
  );
  await q(
    `INSERT INTO negotiation_request_lines (negotiation_request_id, quotation_line_id, customer_comment)
     VALUES ($1, $2, 'Requesting 8% discount on this line given our purchase volume.')`,
    [nrRows[0].id, lineRows[0].id]
  );
}

await q('COMMIT');
console.log('    Negotiation done.');

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 6 — FULFILLMENT ORDERS
// ─────────────────────────────────────────────────────────────────────────────
await q('BEGIN');
console.log('\n[6] Seeding fulfillment orders…');

const fulfillQuotes = createdQuotes.filter(q =>
  ['approved', 'customer_confirmed'].includes(q.status)
);

for (const qt of fulfillQuotes) {
  const existing = await maybeId('fulfillment_orders', 'quotation_id', qt.quoteId);
  if (existing) continue;

  const foStatus = qt.status === 'customer_confirmed' ? 'allocated' : 'planned';
  const { rows: foRows } = await q(
    `INSERT INTO fulfillment_orders (quotation_id, status, allocation_mode)
     VALUES ($1, $2, 'suggested') RETURNING id`,
    [qt.quoteId, foStatus]
  );
  const foId = foRows[0].id;

  // get lines from the latest version
  const { rows: vRows } = await q(
    `SELECT qv.id FROM quotation_versions qv WHERE qv.quotation_id=$1 ORDER BY version_number DESC LIMIT 1`,
    [qt.quoteId]
  );
  const { rows: lineRows } = await q(
    `SELECT ql.id, ql.product_id, ql.quantity FROM quotation_lines ql WHERE ql.quotation_version_id=$1`,
    [vRows[0].id]
  );

  for (const line of lineRows) {
    const qty = Number(line.quantity);
    // allocations are 'allocated' regardless of order status — schema has no 'planned' alloc status
    // Split to East if quantity > 3
    if (qty > 3) {
      const mainQty = Math.ceil(qty / 2);
      const eastQty = Math.floor(qty / 2);
      await q(
        `INSERT INTO fulfillment_allocations (fulfillment_order_id, quotation_line_id, warehouse_id, quantity, status)
         VALUES ($1,$2,$3,$4,$5)`,
        [foId, line.id, mainWh, mainQty, 'allocated']
      );
      if (eastQty > 0) {
        await q(
          `INSERT INTO fulfillment_allocations (fulfillment_order_id, quotation_line_id, warehouse_id, quantity, status)
           VALUES ($1,$2,$3,$4,$5)`,
          [foId, line.id, eastWh, eastQty, 'allocated']
        );
      }
    } else {
      await q(
        `INSERT INTO fulfillment_allocations (fulfillment_order_id, quotation_line_id, warehouse_id, quantity, status)
         VALUES ($1,$2,$3,$4,$5)`,
        [foId, line.id, mainWh, qty, 'allocated']
      );
    }
  }
}

await q('COMMIT');
console.log('    Fulfillment done.');

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 7 — INVOICES & PAYMENTS
// ─────────────────────────────────────────────────────────────────────────────
await q('BEGIN');
console.log('\n[7] Seeding invoices & payments…');

const confirmedQuotes = createdQuotes.filter(q => q.status === 'customer_confirmed');
// Use timestamp prefix so numbers are unique across runs
const invRunId = Date.now();
let invSeq = 1;

for (const [idx, qt] of confirmedQuotes.entries()) {
  const { rows: vRows } = await q(
    `SELECT grand_total FROM quotation_versions WHERE quotation_id=$1 ORDER BY version_number DESC LIMIT 1`,
    [qt.quoteId]
  );
  const amountDue = Number(parseFloat(vRows[0].grand_total).toFixed(2));
  const invNum = `INV-${invRunId}-${String(invSeq++).padStart(3, '0')}`;

  const { rows: invRows } = await q(
    `INSERT INTO invoices (invoice_number, quotation_id, customer_id, currency_code, amount_due, status, due_at, issued_at)
     VALUES ($1,$2,$3,'USD',$4,'issued', now()+'30 days', now()) RETURNING id`,
    [invNum, qt.quoteId, qt.customerId, amountDue]
  );
  const invoiceId = invRows[0].id;

  // Alternate: every other gets paid
  if (idx % 2 === 0) {
    await q(
      `INSERT INTO payments (invoice_id, amount, payment_method, external_reference, paid_at)
       VALUES ($1,$2,'bank_transfer',$3,now())`,
      [invoiceId, amountDue, `WIRE-SEED-${invSeq}`]
    );
    await q(`UPDATE invoices SET status='paid', amount_paid=$1 WHERE id=$2`, [amountDue, invoiceId]);
  }
}

await q('COMMIT');
console.log('    Invoices and payments done.');

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 8 — SUBSCRIPTIONS & BILLING SCHEDULES
// ─────────────────────────────────────────────────────────────────────────────
await q('BEGIN');
console.log('\n[8] Seeding subscriptions…');

const planIdMap = {};
for (const code of ['MONTHLY-SUPPORT', 'QUARTERLY-SUPPORT', 'ANNUAL-SUPPORT', 'CLOUD-MONTHLY']) {
  planIdMap[code] = await rowId('subscription_plans', 'code', code);
}

for (const qt of confirmedQuotes) {
  // find any recurring line on this quote
  const { rows: vRows } = await q(
    `SELECT qv.id FROM quotation_versions qv WHERE qv.quotation_id=$1 ORDER BY version_number DESC LIMIT 1`,
    [qt.quoteId]
  );
  const { rows: recurLines } = await q(
    `SELECT ql.id, ql.product_id FROM quotation_lines ql
     JOIN products p ON p.id = ql.product_id
     WHERE ql.quotation_version_id=$1 AND p.billing_kind='recurring'`,
    [vRows[0].id]
  );
  if (recurLines.length === 0) continue;

  for (const rl of recurLines) {
    const planCode = rl.product_id === pSuppAnn ? 'ANNUAL-SUPPORT'
                   : rl.product_id === pSuppQtr ? 'QUARTERLY-SUPPORT'
                   : rl.product_id === pCloud   ? 'CLOUD-MONTHLY'
                   : 'MONTHLY-SUPPORT';
    const planId = planIdMap[planCode];

    const { rows: subRows } = await q(
      `INSERT INTO subscriptions (customer_id, quotation_line_id, plan_id, status, started_at, ends_at)
       VALUES ($1, $2, $3, 'active', now(), now() + interval '1 year') RETURNING id`,
      [qt.customerId, rl.id, planId]
    );
    const subId = subRows[0].id;

    for (let m = 1; m <= 3; m++) {
      await q(
        `INSERT INTO billing_schedules (subscription_id, due_at, amount, status)
         VALUES ($1, now() + ($2 * interval '30 days'), 99, 'pending')`,
        [subId, m]
      );
    }
  }
}

await q('COMMIT');
console.log('    Subscriptions done.');

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 9 — DEAL HEALTH & QUOTE REQUESTS
// ─────────────────────────────────────────────────────────────────────────────
await q('BEGIN');
console.log('\n[9] Seeding deal health assessments & quote requests…');

// Deal health policy snapshot
const { rows: dhpRows } = await q(`SELECT * FROM deal_health_policies WHERE is_active LIMIT 1`);
const dhPolicy = dhpRows[0] ?? {};
const policySnap = JSON.stringify({
  turn_points: dhPolicy.turn_points ?? 10,
  quote_age_day_points: dhPolicy.quote_age_day_points ?? 2,
  inactivity_day_points: dhPolicy.inactivity_day_points ?? 5,
  warning_threshold: dhPolicy.warning_threshold ?? 50,
  manager_threshold: dhPolicy.manager_threshold ?? 75,
  finance_threshold: dhPolicy.finance_threshold ?? 90,
});

const activeQuotes = createdQuotes.filter(q =>
  !['draft', 'cancelled', 'expired'].includes(q.status)
).slice(0, 20);

for (const qt of activeQuotes) {
  const turns = Math.floor(Math.random() * 4);
  const ageD  = Math.floor(Math.random() * 45) + 1;
  const inactD= Math.floor(Math.random() * 10) + 1;
  const score = Math.min(100, turns * 10 + ageD * 2 + inactD * 5);
  const band  = score < 50 ? 'normal' : score < 75 ? 'warning' : score < 90 ? 'manager' : 'finance';

  await q(
    `INSERT INTO deal_health_assessments (quotation_id, negotiation_turns, quote_age_days, inactivity_days, score, band, policy_snapshot)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [qt.quoteId, turns, ageD, inactD, score, band, policySnap]
  );
}

// Quote requests from portal contacts
const portalRequests = [
  { cId: nexusId,    email: 'cfo@nexustech.example',     msg: 'Need pricing for 20 Pro Laptops and server infrastructure.' },
  { cId: horizonId,  email: 'ops@horizon.example',        msg: 'ERP + implementation services. Can we get a quote?' },
  { cId: sproutId,   email: 'founder@sprout.example',     msg: 'New startup — CRM and cloud storage bundle pricing?' },
  { cId: kiteId,     email: 'cto@kiteanalytics.example',  msg: 'Security audit + data migration for new system.' },
  { cId: deltaId,    email: 'ops@deltasmb.example',       msg: '5 workstations with monitors. Any volume discounts?' },
  { cId: pulseId,    email: 'pm@pulsedigital.example',    msg: 'Quarterly support plan + WiFi APs for office expansion.' },
  { cId: emberId,    email: 'ceo@emberstudio.example',    msg: '3 laptops and USB-C docks — what is the price?' },
  { cId: frostId,    email: 'design@frost.example',       msg: '4K monitors for design studio — bulk pricing available?' },
  { cId: cobaltId,   email: 'dev@cobalttech.example',     msg: 'Cloud storage and annual support for 10-person dev team.' },
  { cId: trialId,    email: 'info@trialco.example',       msg: 'First enquiry — want to see what solutions fit our needs.' },
];

for (const { cId, email, msg } of portalRequests) {
  const { rows: contactRows } = await q(
    `SELECT id FROM customer_contacts WHERE customer_id=$1 AND email=$2`, [cId, email]
  );
  if (!contactRows[0]) continue;

  const { rows: repRows } = await q(
    `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id AND ur.role='sales_rep'
     WHERE u.is_active
     ORDER BY (SELECT count(*) FROM quote_requests qr
               WHERE qr.assigned_sales_rep_id=u.id AND qr.status IN ('pending','viewed')) ASC, u.created_at ASC
     LIMIT 1`
  );
  if (!repRows[0]) continue;

  await q(
    `INSERT INTO quote_requests (customer_id, contact_id, message, assigned_sales_rep_id, assigned_at, status)
     VALUES ($1,$2,$3,$4,now(),'pending')`,
    [cId, contactRows[0].id, msg, repRows[0].id]
  );
}

await q('COMMIT');
console.log('    Deal health and quote requests done.');

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
const { rows: counts } = await q(`
  SELECT
    (SELECT count(*) FROM users)                   AS users,
    (SELECT count(*) FROM customers)               AS customers,
    (SELECT count(*) FROM customer_contacts)       AS contacts,
    (SELECT count(*) FROM products)                AS products,
    (SELECT count(*) FROM quotations)              AS quotations,
    (SELECT count(*) FROM quotation_versions)      AS quotation_versions,
    (SELECT count(*) FROM quotation_lines)         AS quotation_lines,
    (SELECT count(*) FROM risk_assessments)        AS risk_assessments,
    (SELECT count(*) FROM approval_instances)      AS approval_instances,
    (SELECT count(*) FROM negotiation_cases)       AS negotiation_cases,
    (SELECT count(*) FROM invoices)                AS invoices,
    (SELECT count(*) FROM payments)                AS payments,
    (SELECT count(*) FROM fulfillment_orders)      AS fulfillment_orders,
    (SELECT count(*) FROM subscriptions)           AS subscriptions,
    (SELECT count(*) FROM deal_health_assessments) AS deal_health,
    (SELECT count(*) FROM quote_requests)          AS quote_requests
`);

console.log('\n════════════════════════════════════════════════');
console.log('  Full seed complete. Row counts:');
const c = counts[0];
for (const [k, v] of Object.entries(c)) {
  console.log(`    ${k.padEnd(28)} ${v}`);
}
console.log('════════════════════════════════════════════════\n');

await client.release();
await pool.end();
