/**
 * Fulfillment data access (parameterized SQL only).
 */

const SELECT_QUOTE = `
  SELECT q.id,
         q.status,
         q.lock_version AS "lockVersion"
  FROM quotations q
  WHERE q.id = $1
`;

// Physical (one-time) lines of the current quote version. Recurring
// subscription lines are excluded from warehouse fulfillment by joining
// products on billing_kind.
const SELECT_PHYSICAL_LINES = `
  SELECT ql.id         AS "quotationLineId",
         ql.product_id AS "productId",
         ql.quantity,
         p.name        AS "productName"
  FROM quotation_lines ql
  JOIN quotation_versions qv ON qv.id = ql.quotation_version_id
  JOIN quotations q           ON q.id = qv.quotation_id
  JOIN products p             ON p.id = ql.product_id
  WHERE q.id = $1
    AND qv.version_number = q.current_version_number
    AND p.billing_kind = 'one_time'
  ORDER BY ql.line_number
`;

const SELECT_INVENTORY = `
  SELECT il.warehouse_id      AS "warehouseId",
         il.product_id        AS "productId",
         il.quantity_on_hand  AS "quantityOnHand",
         il.quantity_reserved AS "quantityReserved"
  FROM inventory_levels il
  JOIN warehouses w ON w.id = il.warehouse_id
  WHERE w.is_active = TRUE
`;

const SELECT_WAREHOUSES = `
  SELECT id, code, name, shipping_cost_weight AS "shippingCostWeight"
  FROM warehouses
  WHERE is_active = TRUE
`;

// Lock the quote row so no two allocations / revisions race on its status.
const LOCK_QUOTE = `
  SELECT id, status, lock_version AS "lockVersion"
  FROM quotations
  WHERE id = $1
  FOR UPDATE
`;

const SELECT_LIVE_ORDER = `
  SELECT id,
         quotation_id    AS "quotationId",
         status,
         allocation_mode AS "allocationMode"
  FROM fulfillment_orders
  WHERE quotation_id = $1
    AND status <> 'cancelled'
  LIMIT 1
`;

const SELECT_ORDER = `
  SELECT id,
         quotation_id AS "quotationId",
         status,
         allocation_mode AS "allocationMode",
         created_at AS "createdAt",
         updated_at AS "updatedAt"
  FROM fulfillment_orders
  WHERE id = $1
`;

// Lock the live order row while re-allocating (manual override / consolidation).
const LOCK_ORDER = `
  SELECT id,
         quotation_id    AS "quotationId",
         status,
         allocation_mode AS "allocationMode"
  FROM fulfillment_orders
  WHERE id = $1
  FOR UPDATE
`;

const INSERT_ORDER = `
  INSERT INTO fulfillment_orders (quotation_id, status, allocation_mode)
  VALUES ($1, 'planned', $2)
  RETURNING id
`;

const INSERT_ALLOCATION = `
  INSERT INTO fulfillment_allocations
    (fulfillment_order_id, quotation_line_id, warehouse_id, quantity, status)
  VALUES ($1, $2, $3, $4, $5)
  RETURNING id
`;

// Reserve only when stock is genuinely available (guards concurrent orders).
const RESERVE_STOCK = `
  UPDATE inventory_levels
  SET quantity_reserved = quantity_reserved + $3
  WHERE warehouse_id = $1
    AND product_id = $2
    AND (quantity_on_hand - quantity_reserved) >= $3
  RETURNING warehouse_id
`;

// Release a reservation (idempotent floor at zero).
const RELEASE_STOCK = `
  UPDATE inventory_levels
  SET quantity_reserved = GREATEST(0, quantity_reserved - $3)
  WHERE warehouse_id = $1 AND product_id = $2
`;

const UPDATE_ORDER_STATE = `
  UPDATE fulfillment_orders
  SET status = $2,
      allocation_mode = $3,
      updated_at = now()
  WHERE id = $1
  RETURNING id
`;

// Advance the quotation into the fulfillment flow (optimistic on lock_version).
const UPDATE_QUOTE_STATUS = `
  UPDATE quotations
  SET status = $2,
      lock_version = lock_version + 1,
      updated_at = now()
  WHERE id = $1
    AND lock_version = $3
  RETURNING id
`;

const SELECT_ALLOCATIONS = `
  SELECT fa.id,
         fa.fulfillment_order_id AS "fulfillmentOrderId",
         fa.quotation_line_id    AS "quotationLineId",
         ql.product_id           AS "productId",
         fa.warehouse_id         AS "warehouseId",
         fa.quantity,
         fa.status
  FROM fulfillment_allocations fa
  JOIN quotation_lines ql ON ql.id = fa.quotation_line_id
  WHERE fa.fulfillment_order_id = $1
  ORDER BY fa.id
`;

// Backordered allocations of an order, mapped to their product.
const SELECT_BACKORDERS = `
  SELECT fa.id,
         fa.fulfillment_order_id AS "fulfillmentOrderId",
         fa.quotation_line_id    AS "quotationLineId",
         ql.product_id           AS "productId",
         fa.warehouse_id         AS "warehouseId",
         fa.quantity
  FROM fulfillment_allocations fa
  JOIN quotation_lines ql ON ql.id = fa.quotation_line_id
  WHERE fa.fulfillment_order_id = $1
    AND fa.status = 'backordered'
  ORDER BY fa.id
`;

// Update an allocation row's quantity/status.
const UPDATE_ALLOCATION = `
  UPDATE fulfillment_allocations
  SET quantity = $3,
      status = $4
  WHERE id = $1
    AND fulfillment_order_id = $2
  RETURNING id
`;

const CANCEL_ALLOCATION = `
  UPDATE fulfillment_allocations
  SET status = 'cancelled'
  WHERE id = $1
  RETURNING id
`;

export async function findQuote(client, quotationId) {
  const { rows } = await client.query(SELECT_QUOTE, [quotationId]);
  return rows[0] ?? null;
}

export async function findPhysicalLines(client, quotationId) {
  const { rows } = await client.query(SELECT_PHYSICAL_LINES, [quotationId]);
  return rows;
}

export async function findInventory(client) {
  const { rows } = await client.query(SELECT_INVENTORY);
  return rows;
}

export async function findWarehouses(client) {
  const { rows } = await client.query(SELECT_WAREHOUSES);
  return rows;
}

/** Row-lock the quote for the duration of the allocation transaction. */
export async function lockQuote(client, quotationId) {
  const { rows } = await client.query(LOCK_QUOTE, [quotationId]);
  return rows[0] ?? null;
}

export async function findLiveOrder(client, quotationId) {
  const { rows } = await client.query(SELECT_LIVE_ORDER, [quotationId]);
  return rows[0] ?? null;
}

export async function findOrder(client, fulfillmentOrderId) {
  const { rows } = await client.query(SELECT_ORDER, [fulfillmentOrderId]);
  return rows[0] ?? null;
}

/** Row-lock an order while replacing its allocations. */
export async function lockOrder(client, orderId) {
  const { rows } = await client.query(LOCK_ORDER, [orderId]);
  return rows[0] ?? null;
}

export async function insertOrder(client, { quotationId, allocationMode }) {
  const { rows } = await client.query(INSERT_ORDER, [quotationId, allocationMode]);
  return rows[0];
}

export async function insertAllocation(client, row) {
  const { rows } = await client.query(INSERT_ALLOCATION, [
    row.fulfillmentOrderId,
    row.quotationLineId,
    row.warehouseId,
    row.quantity,
    row.status
  ]);
  return rows[0];
}

export async function reserveStock(client, { warehouseId, productId, quantity }) {
  const { rowCount } = await client.query(RESERVE_STOCK, [warehouseId, productId, quantity]);
  return rowCount === 1;
}

export async function releaseStock(client, { warehouseId, productId, quantity }) {
  await client.query(RELEASE_STOCK, [warehouseId, productId, quantity]);
}

export async function updateOrderState(client, { id, status, allocationMode }) {
  const { rows } = await client.query(UPDATE_ORDER_STATE, [id, status, allocationMode]);
  return rows[0] ?? null;
}

/** Advance the quotation status; returns updated row or null on lock clash. */
export async function updateQuoteStatus(client, { quotationId, status, expectedLockVersion }) {
  const { rows } = await client.query(UPDATE_QUOTE_STATUS, [
    quotationId,
    status,
    expectedLockVersion
  ]);
  return rows[0] ?? null;
}

export async function findOrderAllocations(client, fulfillmentOrderId) {
  const { rows } = await client.query(SELECT_ALLOCATIONS, [fulfillmentOrderId]);
  return rows;
}

export async function cancelAllocation(client, allocationId) {
  const { rows } = await client.query(CANCEL_ALLOCATION, [allocationId]);
  return rows[0] ?? null;
}

export async function findBackorders(client, fulfillmentOrderId) {
  const { rows } = await client.query(SELECT_BACKORDERS, [fulfillmentOrderId]);
  return rows;
}

export async function updateAllocation(client, { id, fulfillmentOrderId, quantity, status }) {
  const { rows } = await client.query(UPDATE_ALLOCATION, [
    id,
    fulfillmentOrderId,
    quantity,
    status
  ]);
  return rows[0] ?? null;
}
