// Shared Sales Representative quotation, pricing, risk, and routing domain logic.
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { AppError } from '../../shared/http.js';
import { writeAuditAndOutbox } from '../../infrastructure/database/transaction.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
const d = (value) => new Decimal(value ?? 0);
const amount = (value) => d(value).toDecimalPlaces(4).toFixed(4);
const percent = (value) => d(value).toDecimalPlaces(4).toFixed(4);

async function resolveCustomer(client, customerId) {
  const { rows } = await client.query(`SELECT c.*,ct.code AS tier_code,COALESCE(ct.entitlement_discount_percent,0) AS entitlement_discount_percent,ct.policy_version AS tier_policy_version FROM customers c LEFT JOIN customer_tiers ct ON ct.id=c.tier_id WHERE c.id=$1`, [customerId]);
  if (!rows[0]) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer was not found.');
  return rows[0];
}

async function resolveLine(client, input, customer, currencyCode, discountMode, orderDiscountPercent, lineNumber) {
  const { rows } = await client.query(`SELECT p.*,c.code AS category_code,c.discount_ceiling_percent,c.policy_version AS category_policy_version FROM products p JOIN product_categories c ON c.id=p.category_id WHERE p.id=$1 AND p.is_active`, [input.productId]);
  const product = rows[0];
  if (!product) throw new AppError(422, 'PRODUCT_INACTIVE', 'A quotation line references an inactive or missing product.');
  if (input.productVariantId) {
    const variant = await client.query('SELECT id FROM product_variants WHERE id=$1 AND product_id=$2 AND is_active', [input.productVariantId, product.id]);
    if (!variant.rows[0]) throw new AppError(422, 'INVALID_VARIANT', 'Product variant does not belong to the selected active product.');
  }
  const price = await client.query(`SELECT pli.unit_price FROM price_lists pl JOIN price_list_items pli ON pli.price_list_id=pl.id WHERE pl.is_active AND pli.product_id=$1 AND pl.currency_code=$2 AND (pl.tier_id=$3 OR pl.tier_id IS NULL) AND (pli.valid_from IS NULL OR pli.valid_from<=now()) AND (pli.valid_to IS NULL OR pli.valid_to>now()) ORDER BY (pl.tier_id IS NOT NULL) DESC, pli.valid_from DESC NULLS LAST LIMIT 1`, [product.id, currencyCode, customer.tier_id]);
  const unitPrice = d(price.rows[0]?.unit_price ?? product.list_price);
  const discount = discountMode === 'order' ? d(orderDiscountPercent) : d(input.lineDiscountPercent);
  const allowed = Decimal.min(d(customer.entitlement_discount_percent), d(product.discount_ceiling_percent));
  const base = d(input.quantity).mul(unitPrice);
  const net = base.mul(d(1).minus(discount.div(100)));
  const overage = Decimal.max(d(0), discount.minus(allowed));
  const excess = base.mul(overage).div(100);
  return {
    db: [lineNumber, product.id, input.productVariantId ?? null, product.category_id, product.name, amount(input.quantity), amount(unitPrice), amount(base), discountMode === 'line' ? percent(discount) : null, percent(allowed), amount(net), percent(product.tax_percent), {
      product: { id: product.id, sku: product.sku, name: product.name, standardCost: product.standard_cost, billingKind: product.billing_kind },
      category: { id: product.category_id, code: product.category_code, ceiling: product.discount_ceiling_percent, policyVersion: product.category_policy_version },
      customerTier: { id: customer.tier_id, code: customer.tier_code ?? 'none', entitlement: customer.entitlement_discount_percent, policyVersion: customer.tier_policy_version ?? 0 },
      requestedDiscountPercent: percent(discount)
    }],
    risk: { requested: discount, allowed, overage, base, excess }, base, net, tax: net.mul(d(product.tax_percent)).div(100)
  };
}

export async function createQuoteVersion(client, { quotation, customer, input, actorUserId, versionNumber }) {
  const resolved = [];
  for (const [index, line] of input.lines.entries()) resolved.push(await resolveLine(client, line, customer, input.currencyCode, input.discountMode, input.orderDiscountPercent, index + 1));
  const preDiscountTotal = resolved.reduce((sum, line) => sum.plus(line.base), d(0));
  if (preDiscountTotal.lte(0)) throw new AppError(422, 'ZERO_PRE_DISCOUNT_TOTAL', 'A quotation must have a positive pre-discount total.');
  const discountTotal = resolved.reduce((sum, line) => sum.plus(line.base.minus(line.net)), d(0));
  const netTotal = resolved.reduce((sum, line) => sum.plus(line.net), d(0));
  const taxTotal = resolved.reduce((sum, line) => sum.plus(line.tax), d(0));
  const tierSnapshot = { id: customer.tier_id, code: customer.tier_code ?? 'none', entitlementDiscountPercent: customer.entitlement_discount_percent, policyVersion: customer.tier_policy_version ?? 0 };
  const { rows } = await client.query(`INSERT INTO quotation_versions (quotation_id,version_number,created_by_user_id,reason,discount_mode,order_discount_percent,currency_code,pre_discount_total,discount_total,net_total,tax_total,grand_total,pricing_snapshot,policy_snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [quotation.id, versionNumber, actorUserId, input.reason, input.discountMode, input.discountMode === 'order' ? percent(input.orderDiscountPercent) : null, input.currencyCode, amount(preDiscountTotal), amount(discountTotal), amount(netTotal), amount(taxTotal), amount(netTotal.plus(taxTotal)), { resolvedAt: new Date().toISOString(), customerTier: tierSnapshot }, { customerTier: tierSnapshot }]);
  const version = rows[0];
  for (const line of resolved) await client.query(`INSERT INTO quotation_lines (quotation_version_id,line_number,product_id,product_variant_id,category_id,description,quantity,unit_price,line_base_value,line_discount_percent,allowed_discount_percent,net_line_value,tax_percent,line_snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [version.id, ...line.db]);
  const lineRows = await client.query('SELECT id,line_number FROM quotation_lines WHERE quotation_version_id=$1 ORDER BY line_number', [version.id]);
  const excessTotal = resolved.reduce((sum, line) => sum.plus(line.risk.excess), d(0));
  const blended = excessTotal.div(preDiscountTotal).mul(100);
  const policy = await client.query('SELECT * FROM approval_policies WHERE is_active ORDER BY policy_version DESC LIMIT 1');
  if (!policy.rows[0]) throw new AppError(409, 'MISSING_APPROVAL_POLICY', 'An active approval policy must be configured.');
  const approvalPolicy = policy.rows[0];
  const route = blended.eq(0) ? 'none' : blended.lte(d(approvalPolicy.manager_max_blended_risk_percent)) ? 'manager' : 'manager_then_finance';
  const assessment = await client.query(`INSERT INTO risk_assessments (quotation_version_id,total_pre_discount_order_value,total_line_excess_value,blended_risk_percent,route,inputs_snapshot,policy_snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [version.id, amount(preDiscountTotal), amount(excessTotal), percent(blended), route, { lines: resolved.map((line) => ({ requested: percent(line.risk.requested), allowed: percent(line.risk.allowed), overage: percent(line.risk.overage), base: amount(line.risk.base), excess: amount(line.risk.excess) })) }, approvalPolicy]);
  for (const [index, line] of resolved.entries()) await client.query(`INSERT INTO risk_assessment_lines (risk_assessment_id,quotation_line_id,requested_discount_percent,allowed_discount_percent,line_overage_percent,line_base_value,line_excess_value) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [assessment.rows[0].id, lineRows.rows[index].id, percent(line.risk.requested), percent(line.risk.allowed), percent(line.risk.overage), amount(line.risk.base), amount(line.risk.excess)]);
  return { version, assessment: assessment.rows[0] };
}

export function quoteNumber() { return `DF-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${randomUUID().slice(0,8).toUpperCase()}`; }

export async function routeApproval(client, { quotation, version, assessment, actorUserId }) {
  await client.query('UPDATE approval_instances SET status=$1 WHERE quotation_version_id <> $2 AND quotation_id=$3 AND status=$4', ['superseded', version.id, quotation.id, 'pending']);
  if (assessment.route === 'none') {
    // A quote within its discount limits has not been accepted by the customer.
    // It is an initial commercial offer and must remain available for negotiation.
    await client.query(`UPDATE quotations SET status='sent_to_customer', last_activity_at=now(), updated_at=now() WHERE id=$1`, [quotation.id]);
    await writeAuditAndOutbox(client, {
      aggregateType: 'quotation',
      aggregateId: quotation.id,
      eventType: 'quotation.sent_to_customer',
      actorUserId,
      metadata: {
        versionNumber: version.version_number,
        blendedRiskPercent: assessment.blended_risk_percent,
        route: assessment.route
      }
    });
    return 'sent_to_customer';
  }
  // Approval instances represent work that is actionable now.  For the sequential
  // route, Finance is created only after the Manager has approved; creating both
  // here would allow Finance to approve a deal before its required first step.
  const roles = assessment.route === 'manager' || assessment.route === 'manager_then_finance'
    ? ['sales_manager']
    : ['finance_operations'];
  for (const [index, role] of roles.entries()) await client.query(`INSERT INTO approval_instances (quotation_id,quotation_version_id,risk_assessment_id,sequence_number,required_role,status) VALUES ($1,$2,$3,$4,$5,'pending')`, [quotation.id,version.id,assessment.id,index+1,role]);
  const status = roles[0] === 'sales_manager' ? 'pending_manager_approval' : 'pending_finance_approval';
  await client.query('UPDATE quotations SET status=$1,last_activity_at=now(),updated_at=now() WHERE id=$2',[status,quotation.id]);
  await writeAuditAndOutbox(client,{aggregateType:'quotation',aggregateId:quotation.id,eventType:'quotation.submitted',actorUserId,metadata:{versionNumber:version.version_number,blendedRiskPercent:assessment.blended_risk_percent,route:assessment.route}});
  return status;
}
