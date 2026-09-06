'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, Card, PageHeader, Table, Td, Tr } from '@/components/ui';
import { api } from '@/lib/api';
import { useLiveUpdates } from '@/lib/useLiveUpdates';
import { useRoleGuard } from '@/lib/useRoleGuard';

type Warehouse = {
  id: string;
  code: string;
  name: string;
  shipping_cost_weight: string;
  is_active: boolean;
  stocked_products: number;
  available_units: string;
};
type Product = { id: string; sku: string; name: string; billing_kind: string; is_active: boolean };
type Stock = { product_id: string; quantity_on_hand: string; quantity_reserved: string; sku: string; name: string; unit_name: string };

const blankWarehouse = { code: '', name: '', shippingCostWeight: '0', isActive: true };

export default function WarehouseSettingsPage() {
  useRoleGuard(['admin']);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [warehouseForm, setWarehouseForm] = useState(blankWarehouse);
  const [adjustments, setAdjustments] = useState<Record<string, { delta: string; reason: string }>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const selected = warehouses.find((warehouse) => warehouse.id === selectedId) ?? null;
  const physicalProducts = useMemo(
    () => products.filter((product) => product.is_active && product.billing_kind === 'one_time'),
    [products]
  );

  const load = useCallback(async () => {
    try {
      const [warehouseResponse, productResponse] = await Promise.all([
        api.get<{ data: Warehouse[] }>('/admin/warehouses'),
        api.get<{ data: Product[] }>('/admin/products?includeInactive=true')
      ]);
      setWarehouses(warehouseResponse.data);
      setProducts(productResponse.data);
      setSelectedId((current) => current && warehouseResponse.data.some((warehouse) => warehouse.id === current)
        ? current
        : warehouseResponse.data[0]?.id ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load warehouse setup.');
    }
  }, []);

  const loadStock = useCallback(async (warehouseId: string | null) => {
    if (!warehouseId) { setStock([]); return; }
    try {
      const response = await api.get<{ data: Stock[] }>(`/admin/warehouses/${warehouseId}/inventory`);
      setStock(response.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not load warehouse stock.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadStock(selectedId); }, [loadStock, selectedId]);
  useLiveUpdates(() => { void load(); void loadStock(selectedId); });

  const stockFor = (productId: string) => stock.find((row) => row.product_id === productId);

  function selectWarehouse(warehouse: Warehouse) {
    setSelectedId(warehouse.id);
    setWarehouseForm({
      code: warehouse.code,
      name: warehouse.name,
      shippingCostWeight: String(warehouse.shipping_cost_weight),
      isActive: warehouse.is_active
    });
    setNotice('');
  }

  function beginNewWarehouse() {
    setSelectedId(null);
    setWarehouseForm(blankWarehouse);
    setStock([]);
    setNotice('');
  }

  async function saveWarehouse() {
    if (!warehouseForm.code.trim() || !warehouseForm.name.trim()) return;
    setSaving(true); setError('');
    const body = {
      code: warehouseForm.code.trim().toUpperCase(),
      name: warehouseForm.name.trim(),
      shippingCostWeight: Number(warehouseForm.shippingCostWeight),
      isActive: warehouseForm.isActive
    };
    try {
      const result = selected
        ? await api.put<{ data: Warehouse }>(`/admin/warehouses/${selected.id}`, body)
        : await api.post<{ data: Warehouse }>('/admin/warehouses', body);
      setNotice(selected ? 'Warehouse settings updated.' : 'Warehouse created. Add stock below once it is selected.');
      await load();
      setSelectedId(result.data.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save warehouse.');
    } finally { setSaving(false); }
  }

  async function adjustStock(productId: string) {
    if (!selected) return;
    const input = adjustments[productId] ?? { delta: '', reason: '' };
    if (!input.delta || !input.reason.trim()) return;
    setSaving(true); setError('');
    try {
      await api.post(`/admin/warehouses/${selected.id}/inventory-adjustments`, {
        productId,
        deltaQuantity: Number(input.delta),
        reason: input.reason.trim()
      });
      setAdjustments((items) => ({ ...items, [productId]: { delta: '', reason: '' } }));
      setNotice('Stock updated and recorded in the audit trail.');
      await Promise.all([load(), loadStock(selected.id)]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update stock.');
    } finally { setSaving(false); }
  }

  return <div className="max-w-7xl">
    <PageHeader title="Warehouse setup" subtitle="Admin controls warehouse availability, shipment costs, and product stock. Finance uses these live inputs to choose the lowest-cost allocation." />
    {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {notice && <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>}

    <div className="mb-5 flex flex-wrap gap-2">
      <Button variant="primary" onClick={beginNewWarehouse}>Add warehouse</Button>
    </div>

    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.5fr]">
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Warehouses</h2>
        <div className="space-y-2">
          {warehouses.length === 0 && <p className="text-sm text-gray-500">No warehouses configured yet.</p>}
          {warehouses.map((warehouse) => <button key={warehouse.id} type="button" onClick={() => selectWarehouse(warehouse)} className={`w-full rounded-lg border p-3 text-left ${selectedId === warehouse.id ? 'border-brand bg-brand-50' : 'border-gray-200 hover:border-brand-200'}`}>
            <div className="flex justify-between gap-2"><span className="font-medium text-gray-900">{warehouse.name}</span><Badge variant={warehouse.is_active ? 'green' : 'gray'}>{warehouse.is_active ? 'active' : 'inactive'}</Badge></div>
            <p className="mt-1 text-xs text-gray-500">{warehouse.code} · {warehouse.available_units} available units · shipment cost {warehouse.shipping_cost_weight}</p>
          </button>)}
        </div>
      </Card>

      <div className="space-y-5">
        <Card className="p-5">
          <h2 className="font-semibold text-gray-900">{selected ? 'Warehouse settings' : 'New warehouse'}</h2>
          <p className="mt-1 text-sm text-gray-500">Shipment cost is charged once for every warehouse used in an order allocation.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <label className="text-sm text-gray-600">Code<input value={warehouseForm.code} onChange={(event) => setWarehouseForm({ ...warehouseForm, code: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="NORTH" /></label>
            <label className="text-sm text-gray-600">Name<input value={warehouseForm.name} onChange={(event) => setWarehouseForm({ ...warehouseForm, name: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" placeholder="North Warehouse" /></label>
            <label className="text-sm text-gray-600">Shipment cost<input type="number" min="0" step="0.01" value={warehouseForm.shippingCostWeight} onChange={(event) => setWarehouseForm({ ...warehouseForm, shippingCostWeight: event.target.value })} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" /></label>
            <label className="mt-7 flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={warehouseForm.isActive} onChange={(event) => setWarehouseForm({ ...warehouseForm, isActive: event.target.checked })} />Active for allocation</label>
          </div>
          <div className="mt-4"><Button variant="primary" onClick={saveWarehouse} disabled={saving || !warehouseForm.code.trim() || !warehouseForm.name.trim()}>{selected ? 'Save warehouse' : 'Create warehouse'}</Button></div>
        </Card>

        {selected && <Card className="p-5">
          <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-semibold text-gray-900">Stock at {selected.name}</h2><p className="mt-1 text-sm text-gray-500">Add or remove physical product stock. Reserved units cannot be removed.</p></div><Badge variant="blue">Admin managed</Badge></div>
          <div className="mt-4 overflow-x-auto"><Table headers={['SKU / product', 'On hand', 'Reserved', 'Available', 'Adjust by', 'Reason', '']}>
            {physicalProducts.map((product) => {
              const current = stockFor(product.id);
              const adjustment = adjustments[product.id] ?? { delta: '', reason: '' };
              const available = Number(current?.quantity_on_hand ?? 0) - Number(current?.quantity_reserved ?? 0);
              return <Tr key={product.id}><Td><p className="font-medium">{product.name}</p><p className="text-xs text-gray-400">{product.sku}</p></Td><Td>{current?.quantity_on_hand ?? '0'}</Td><Td>{current?.quantity_reserved ?? '0'}</Td><Td>{available}</Td><Td><input aria-label={`Stock adjustment for ${product.name}`} type="number" value={adjustment.delta} onChange={(event) => setAdjustments({ ...adjustments, [product.id]: { ...adjustment, delta: event.target.value } })} className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="+25" /></Td><Td><input aria-label={`Reason for ${product.name}`} value={adjustment.reason} onChange={(event) => setAdjustments({ ...adjustments, [product.id]: { ...adjustment, reason: event.target.value } })} className="min-w-36 rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="Stock received" /></Td><Td><Button variant="secondary" onClick={() => adjustStock(product.id)} disabled={saving || !adjustment.delta || !adjustment.reason.trim()}>Apply</Button></Td></Tr>;
            })}
            {physicalProducts.length === 0 && <Tr><Td colSpan={7}>No active one-time products exist in the catalog.</Td></Tr>}
          </Table></div>
        </Card>}
      </div>
    </div>
  </div>;
}
