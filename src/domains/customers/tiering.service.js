// Tier eligibility is intentionally based on completed, paid business. The
// pure helpers are reused by the payment workflow and unit-tested directly.
const rank = (code) => ({ bronze: 1, silver: 2, gold: 3 }[code] ?? 0);

export function highestEligibleTier(tiers, { netSpend, completedOrders }) {
  return [...tiers]
    .sort((a, b) => rank(b.code) - rank(a.code))
    .find((tier) => Number(netSpend) >= Number(tier.qualification_spend) || completedOrders >= Number(tier.qualification_order_count)) ?? null;
}

export async function evaluateAutomaticTier(client, customerId) {
  const { rows: customers } = await client.query('SELECT * FROM customers WHERE id = $1 FOR UPDATE', [customerId]);
  const customer = customers[0];
  if (!customer || customer.tier_assignment_source === 'admin_override') return null;
  const { rows: totals } = await client.query(
    `SELECT COALESCE(SUM(i.amount_paid - COALESCE(cn.applied_amount, 0)), 0) AS net_spend,
            count(*)::int AS completed_orders
       FROM invoices i
       LEFT JOIN (SELECT invoice_id, SUM(applied_amount) AS applied_amount FROM credit_notes WHERE status = 'applied' GROUP BY invoice_id) cn ON cn.invoice_id = i.id
      WHERE i.customer_id = $1 AND i.status = 'paid'`, [customerId]
  );
  const { rows: tiers } = await client.query('SELECT * FROM customer_tiers WHERE is_active ORDER BY code');
  const nextTier = highestEligibleTier(tiers, totals[0]);
  if ((nextTier?.id ?? null) === (customer.tier_id ?? null)) return null;
  await client.query(`UPDATE customers SET tier_id=$1, tier_assigned_at=now(), tier_override_reason=NULL, updated_at=now() WHERE id=$2`, [nextTier?.id ?? null, customerId]);
  await client.query(`INSERT INTO customer_tier_history (customer_id, previous_tier_id, new_tier_id, assignment_source, reason)
    VALUES ($1,$2,$3,'automatic',$4)`, [customerId, customer.tier_id, nextTier?.id ?? null, nextTier ? 'Customer reached an automatic tier milestone.' : 'Customer no longer meets a tier milestone.']);
  return { previousTierId: customer.tier_id, tier: nextTier, totals: totals[0] };
}
