'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, PageHeader, Table, Td, Tr } from '@/components/ui';
import { api } from '@/lib/api';
import { useLiveUpdates } from '@/lib/useLiveUpdates';
import { useRoleGuard } from '@/lib/useRoleGuard';

type Warehouse = { id: string; code: string; name: string; shippingCostWeight: string; isActive: boolean; stockedProducts: number; availableUnits: string };
type Product = { id: string; sku: string; name: string; billingKind: string };
type Stock = { warehouseId: string; productId: string; quantityOnHand: string; quantityReserved: string; reorderPoint: string };
type Workspace = { warehouses: Warehouse[]; products: Product[]; inventory: Stock[] };

const emptyWarehouse = { code: '', name: '', shippingCostWeight: '1' };

export default function FinanceInventoryPage() {
  useRoleGuard(['finance_operations', 'admin']);
  const [workspace, setWorkspace] = useState<Workspace>({ warehouses: [], products: [], inventory: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [warehouseForm, setWarehouseForm] = useState(emptyWarehouse);
  const [adjustments, setAdjustments] = useState<Record<string, { delta: string; reason: string }>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => api.get<{ data: Workspace }>('/finance/inventory')
    .then((response) => { setWorkspace(response.data); setSelectedId((current) => current && response.data.warehouses.some((warehouse) => warehouse.id === current) ? current : response.data.warehouses[0]?.id ?? null); })
    .catch((err: Error) => setError(err.message)), []);
  useEffect(() => { load(); }, [load]);
  useLiveUpdates(load);

  const selected = workspace.warehouses.find((warehouse) => warehouse.id === selectedId) ?? null;
  const physicalProducts = useMemo(() => workspace.products.filter((product) => product.billingKind === 'one_time'), [workspace.products]);
  const stockFor = (productId: string) => workspace.inventory.find((stock) => stock.warehouseId === selectedId && stock.productId === productId);

  async function setupStarter() {
    setSaving(true); setError('');
    try { const result = await api.post<{ data: { newlyStockedRows: number } }>('/finance/inventory/starter-setup', {}); setNotice(`Starter setup complete. Added ${result.data.newlyStockedRows} missing stock records without changing existing quantities.`); await load(); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Could not create starter inventory.'); }
    finally { setSaving(false); }
  }

  async function saveWarehouse() {
    if (!warehouseForm.code.trim() || !warehouseForm.name.trim()) return;
    setSaving(true); setError('');
    const body = { code: warehouseForm.code.trim(), name: warehouseForm.name.trim(), shippingCostWeight: Number(warehouseForm.shippingCostWeight), isActive: true };
    try {
      if (selected) await api.put(`/finance/inventory/warehouses/${selected.id}`, body);
      else await api.post('/finance/inventory/warehouses', body);
      setNotice(selected ? 'Warehouse details updated.' : 'Warehouse added.'); setWarehouseForm(emptyWarehouse); await load();
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Could not save warehouse.'); }
    finally { setSaving(false); }
  }

  async function adjust(productId: string) {
    if (!selected) return;
    const input = adjustments[productId] ?? { delta: '', reason: '' };
    if (!input.delta || !input.reason.trim()) return;
    setSaving(true); setError('');
    try { await api.post(`/finance/inventory/warehouses/${selected.id}/adjustments`, { productId, deltaQuantity: Number(input.delta), reason: input.reason.trim() }); setAdjustments((items) => ({ ...items, [productId]: { delta: '', reason: '' } })); setNotice('Stock adjusted and recorded in the audit trail.'); await load(); }
    catch (err: unknown) { setError(err instanceof Error ? err.message : 'Could not adjust stock.'); }
    finally { setSaving(false); }
  }

  function selectWarehouse(warehouse: Warehouse) { setSelectedId(warehouse.id); setWarehouseForm({ code: warehouse.code, name: warehouse.name, shippingCostWeight: String(warehouse.shippingCostWeight) }); setNotice(''); }

  return <div>
    <PageHeader title="Warehouse inventory" subtitle="Maintain stock and shipping priorities used by Finance fulfillment allocation." />
    {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {notice && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}
    <div className="mb-5 flex flex-wrap gap-2"><Button variant="secondary" onClick={setupStarter} disabled={saving}>Set up 3 starter warehouses</Button><Button variant="primary" onClick={() => { setSelectedId(null); setWarehouseForm(emptyWarehouse); }}>Add warehouse</Button></div>
    <div className="grid gap-5 lg:grid-cols-[1fr_1.35fr]">
      <Card className="p-4"><h2 className="mb-3 text-sm font-semibold text-gray-900">Warehouses</h2><div className="space-y-2">{workspace.warehouses.length === 0 ? <p className="text-sm text-gray-500">No warehouses yet. Use the starter setup to add North, Central, and South without changing existing data.</p> : workspace.warehouses.map((warehouse) => <button key={warehouse.id} type="button" onClick={() => selectWarehouse(warehouse)} className={`w-full rounded-lg border p-3 text-left ${selectedId === warehouse.id ? 'border-brand bg-brand-50' : 'border-gray-200 hover:border-brand-200'}`}><div className="flex justify-between gap-2"><span className="font-medium text-gray-900">{warehouse.name}</span><Badge variant={warehouse.isActive ? 'green' : 'gray'}>{warehouse.isActive ? 'active' : 'inactive'}</Badge></div><p className="mt-1 text-xs text-gray-500">{warehouse.code} · {warehouse.availableUnits} available units · shipping cost {warehouse.shippingCostWeight}</p></button>)}</div></Card>
      <div className="space-y-5">
        <Card className="p-5"><h2 className="font-semibold text-gray-900">{selected ? 'Edit warehouse' : 'New warehouse'}</h2><div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="text-sm text-gray-600">Code<input value={warehouseForm.code} onChange={(event) => setWarehouseForm({ ...warehouseForm, code: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="NORTH" /></label><label className="text-sm text-gray-600">Name<input value={warehouseForm.name} onChange={(event) => setWarehouseForm({ ...warehouseForm, name: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="North Warehouse" /></label><label className="text-sm text-gray-600">Shipment cost<input type="number" min="0" value={warehouseForm.shippingCostWeight} onChange={(event) => setWarehouseForm({ ...warehouseForm, shippingCostWeight: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label></div><div className="mt-4"><Button variant="primary" onClick={saveWarehouse} disabled={saving || !warehouseForm.code || !warehouseForm.name}>{selected ? 'Save warehouse' : 'Create warehouse'}</Button></div></Card>
        {selected && <Card className="p-5"><div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-semibold text-gray-900">Stock at {selected.name}</h2><p className="mt-1 text-sm text-gray-500">Adjustments cannot reduce available stock below active order reservations.</p></div><Badge variant="blue">Allocation source</Badge></div><div className="mt-4 overflow-x-auto"><Table headers={['SKU / product', 'On hand', 'Reserved', 'Available', 'Adjust by', 'Reason', '']}>
          {physicalProducts.map((product) => { const stock = stockFor(product.id); const adjustment = adjustments[product.id] ?? { delta: '', reason: '' }; const available = Number(stock?.quantityOnHand ?? 0) - Number(stock?.quantityReserved ?? 0); return <Tr key={product.id}><Td><p className="font-medium">{product.name}</p><p className="text-xs text-gray-400">{product.sku}</p></Td><Td>{stock?.quantityOnHand ?? '0'}</Td><Td>{stock?.quantityReserved ?? '0'}</Td><Td>{available}</Td><Td><input aria-label={`Stock adjustment for ${product.name}`} type="number" value={adjustment.delta} onChange={(event) => setAdjustments({ ...adjustments, [product.id]: { ...adjustment, delta: event.target.value } })} className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="+25" /></Td><Td><input aria-label={`Reason for ${product.name}`} value={adjustment.reason} onChange={(event) => setAdjustments({ ...adjustments, [product.id]: { ...adjustment, reason: event.target.value } })} className="min-w-36 rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="Stock received" /></Td><Td><Button variant="secondary" onClick={() => adjust(product.id)} disabled={saving || !adjustment.delta || !adjustment.reason.trim()}>Apply</Button></Td></Tr>; })}
        </Table></div></Card>}
      </div>
    </div>
  </div>;
}
