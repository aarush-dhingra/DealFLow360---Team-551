import { pool } from '../../../infrastructure/database/pool.js';
import { inTransaction, writeAuditAndOutbox } from '../../../infrastructure/database/transaction.js';
import { Errors } from '../../../shared/errors.js';
import { asyncHandler, financePrincipal } from './middleware.js';
import { parse, warehouseParams, warehouseBody, inventoryAdjustmentBody } from './schemas.js';

export const getInventoryWorkspace = asyncHandler(async (_req, res) => {
  const [warehouses, products, inventory] = await Promise.all([
    pool.query(`SELECT w.id,w.code,w.name,w.shipping_cost_weight AS "shippingCostWeight",w.is_active AS "isActive",
      count(il.product_id)::int AS "stockedProducts",COALESCE(sum(il.quantity_on_hand-il.quantity_reserved),0) AS "availableUnits"
      FROM warehouses w LEFT JOIN inventory_levels il ON il.warehouse_id=w.id GROUP BY w.id ORDER BY w.code`),
    pool.query(`SELECT id,sku,name,billing_kind AS "billingKind" FROM products WHERE is_active ORDER BY name`),
    pool.query(`SELECT warehouse_id AS "warehouseId",product_id AS "productId",quantity_on_hand AS "quantityOnHand",quantity_reserved AS "quantityReserved",reorder_point AS "reorderPoint" FROM inventory_levels`)
  ]);
  res.json({ data: { warehouses: warehouses.rows, products: products.rows, inventory: inventory.rows } });
});

export const createWarehouse = asyncHandler(async (req, res) => {
  const input = parse(warehouseBody, req.body);
  const result = await inTransaction(async (client) => {
    const { rows } = await client.query(`INSERT INTO warehouses(code,name,shipping_cost_weight,is_active) VALUES($1,$2,$3,$4) RETURNING id,code,name,shipping_cost_weight AS "shippingCostWeight",is_active AS "isActive"`, [input.code, input.name, input.shippingCostWeight, input.isActive]);
    await writeAuditAndOutbox(client, { aggregateType: 'warehouse', aggregateId: rows[0].id, eventType: 'warehouse.created_by_finance', actorUserId: financePrincipal(req).userId, afterState: rows[0] });
    return rows[0];
  });
  res.status(201).json({ data: result });
});

export const updateWarehouse = asyncHandler(async (req, res) => {
  const { warehouseId } = parse(warehouseParams, req.params);
  const input = parse(warehouseBody, req.body);
  const result = await inTransaction(async (client) => {
    const before = (await client.query('SELECT * FROM warehouses WHERE id=$1 FOR UPDATE', [warehouseId])).rows[0];
    if (!before) throw Errors.notFound('Warehouse not found.');
    const { rows } = await client.query(`UPDATE warehouses SET code=$1,name=$2,shipping_cost_weight=$3,is_active=$4 WHERE id=$5 RETURNING id,code,name,shipping_cost_weight AS "shippingCostWeight",is_active AS "isActive"`, [input.code, input.name, input.shippingCostWeight, input.isActive, warehouseId]);
    await writeAuditAndOutbox(client, { aggregateType: 'warehouse', aggregateId: warehouseId, eventType: 'warehouse.updated_by_finance', actorUserId: financePrincipal(req).userId, beforeState: before, afterState: rows[0] });
    return rows[0];
  });
  res.json({ data: result });
});

export const adjustInventory = asyncHandler(async (req, res) => {
  const { warehouseId } = parse(warehouseParams, req.params);
  const input = parse(inventoryAdjustmentBody, req.body);
  const result = await inTransaction(async (client) => {
    const warehouse = (await client.query('SELECT id FROM warehouses WHERE id=$1 FOR UPDATE', [warehouseId])).rows[0];
    if (!warehouse) throw Errors.notFound('Warehouse not found.');
    const product = (await client.query('SELECT id FROM products WHERE id=$1', [input.productId])).rows[0];
    if (!product) throw Errors.notFound('Product not found.');
    const current = (await client.query('SELECT * FROM inventory_levels WHERE warehouse_id=$1 AND product_id=$2 FOR UPDATE', [warehouseId, input.productId])).rows[0] ?? { quantity_on_hand: '0', quantity_reserved: '0' };
    const next = Number(current.quantity_on_hand) + input.deltaQuantity;
    if (next < Number(current.quantity_reserved)) throw Errors.insufficientStock('Stock cannot be reduced below reserved quantity.');
    const { rows } = await client.query(`INSERT INTO inventory_levels(warehouse_id,product_id,quantity_on_hand,quantity_reserved,reorder_point) VALUES($1,$2,$3,0,0) ON CONFLICT(warehouse_id,product_id) DO UPDATE SET quantity_on_hand=EXCLUDED.quantity_on_hand RETURNING warehouse_id AS "warehouseId",product_id AS "productId",quantity_on_hand AS "quantityOnHand",quantity_reserved AS "quantityReserved"`, [warehouseId, input.productId, next]);
    const adjustment = (await client.query(`INSERT INTO inventory_adjustments(warehouse_id,product_id,delta_quantity,reason,adjusted_by_user_id) VALUES($1,$2,$3,$4,$5) RETURNING id`, [warehouseId, input.productId, input.deltaQuantity, input.reason, financePrincipal(req).userId])).rows[0];
    await writeAuditAndOutbox(client, { aggregateType: 'inventory_adjustment', aggregateId: adjustment.id, eventType: 'inventory.adjusted_by_finance', actorUserId: financePrincipal(req).userId, beforeState: current, afterState: rows[0], metadata: { warehouseId, productId: input.productId, reason: input.reason } });
    return rows[0];
  });
  res.json({ data: result });
});

export const bootstrapStarterInventory = asyncHandler(async (req, res) => {
  const result = await inTransaction(async (client) => {
    const definitions = [['NORTH','North Warehouse',1],['CENTRAL','Central Warehouse',2],['SOUTH','South Warehouse',3]];
    const warehouses = [];
    for (const [code, name, weight] of definitions) {
      await client.query('INSERT INTO warehouses(code,name,shipping_cost_weight,is_active) VALUES($1,$2,$3,true) ON CONFLICT(code) DO NOTHING', [code, name, weight]);
      warehouses.push((await client.query('SELECT id,code,name FROM warehouses WHERE code=$1', [code])).rows[0]);
    }
    const products = (await client.query(`SELECT id FROM products WHERE is_active AND billing_kind='one_time'`)).rows;
    let stockedRows = 0;
    for (const warehouse of warehouses) for (const product of products) {
      const inserted = await client.query(`INSERT INTO inventory_levels(warehouse_id,product_id,quantity_on_hand,quantity_reserved,reorder_point) VALUES($1,$2,25,0,5) ON CONFLICT(warehouse_id,product_id) DO NOTHING RETURNING product_id`, [warehouse.id, product.id]);
      stockedRows += inserted.rowCount;
    }
    await writeAuditAndOutbox(client, { aggregateType: 'warehouse', aggregateId: warehouses[0].id, eventType: 'inventory.starter_setup', actorUserId: financePrincipal(req).userId, metadata: { warehouses: warehouses.map((warehouse) => warehouse.code), newlyStockedRows: stockedRows } });
    return { warehouses: warehouses.length, newlyStockedRows: stockedRows };
  });
  res.json({ data: result });
});
