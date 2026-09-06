'use client';

import { useEffect, useState } from 'react';
import { api, getUser } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { PageHeader, StatCard, Badge, Card, Button } from '@/components/ui';

interface Product {
  id: string;
  name: string;
  sku: string;
  list_price: number;
  standard_cost?: number;
  unit_name: string;
  category_code: string;
  billing_kind?: string;
  is_active?: boolean;
}

interface Category {
  id: string;
  code: string;
  display_name: string;
}

const blankForm = {
  sku: '',
  name: '',
  categoryId: '',
  description: '',
  unitName: 'unit',
  listPrice: '',
  standardCost: '',
  taxPercent: '0',
  billingKind: 'one_time' as 'one_time' | 'recurring',
  isActive: true,
};

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  function loadProducts(admin: boolean) {
    const url = admin
      ? '/admin/products?includeInactive=true'
      : '/sales-rep/quotations/meta/products';
    return api.get<{ data: Product[] }>(url)
      .then((r) => setProducts(Array.isArray(r.data) ? r.data : []));
  }

  useEffect(() => {
    const roles = getUser()?.roles ?? [];
    const admin = roles.includes('admin');
    setIsAdmin(admin);

    const fetches: Promise<unknown>[] = [
      loadProducts(admin).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err))),
    ];
    if (admin) {
      fetches.push(
        api.get<{ categories: Category[] }>('/manager/config/categories')
          .then((r) => setCategories(r.categories ?? []))
          .catch(() => {})
      );
    }
    Promise.all(fetches).finally(() => setLoading(false));
  }, []);

  function field(key: keyof typeof form, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaveError('');
    setSaving(true);
    try {
      await api.post('/admin/products', {
        sku: form.sku.trim().toUpperCase(),
        name: form.name.trim(),
        categoryId: form.categoryId,
        description: form.description.trim() || null,
        unitName: form.unitName.trim() || 'unit',
        listPrice: parseFloat(form.listPrice),
        standardCost: parseFloat(form.standardCost),
        taxPercent: parseFloat(form.taxPercent) || 0,
        billingKind: form.billingKind,
        isActive: form.isActive,
      });
      setForm(blankForm);
      setShowForm(false);
      await loadProducts(true);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  const activeProducts = products.filter((p) => p.is_active !== false);

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <PageHeader title="Product Catalog" subtitle="Every product and price list in one place." />
        {isAdmin && !showForm && (
          <div className="mt-5">
            <Button variant="primary" onClick={() => setShowForm(true)}>+ New Product</Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Products" value={loading ? '…' : activeProducts.length} sub="active in catalog" />
        <StatCard label="Categories" value={loading ? '…' : [...new Set(products.map((p) => p.category_code))].length} sub="product categories" />
        <StatCard label="Avg List Price" value={loading || activeProducts.length === 0 ? '…' : `$${(activeProducts.reduce((s, p) => s + Number(p.list_price), 0) / activeProducts.length).toFixed(0)}`} sub="across active products" />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Could not reach backend: {error}
        </div>
      )}

      {isAdmin && showForm && (
        <Card className="mb-6 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">New Product</h2>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">SKU <span className="text-red-500">*</span></label>
                <input required value={form.sku} onChange={(e) => field('sku', e.target.value)} placeholder="e.g. SUPPORT-ANNUAL"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name <span className="text-red-500">*</span></label>
                <input required value={form.name} onChange={(e) => field('name', e.target.value)} placeholder="e.g. Annual Support Plan"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Category <span className="text-red-500">*</span></label>
                <select required value={form.categoryId} onChange={(e) => field('categoryId', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                  <option value="">Select category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.display_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Billing Type <span className="text-red-500">*</span></label>
                <select value={form.billingKind} onChange={(e) => field('billingKind', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand">
                  <option value="one_time">One-Time</option>
                  <option value="recurring">Recurring (Subscription)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">List Price <span className="text-red-500">*</span></label>
                <input required type="number" min={0} step={0.01} value={form.listPrice} onChange={(e) => field('listPrice', e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Standard Cost <span className="text-red-500">*</span></label>
                <input required type="number" min={0} step={0.01} value={form.standardCost} onChange={(e) => field('standardCost', e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit Name</label>
                <input value={form.unitName} onChange={(e) => field('unitName', e.target.value)} placeholder="unit"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tax %</label>
                <input type="number" min={0} max={100} step={0.1} value={form.taxPercent} onChange={(e) => field('taxPercent', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
              <textarea value={form.description} onChange={(e) => field('description', e.target.value)} rows={2} placeholder="Optional product description"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand resize-none" />
            </div>

            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={form.isActive} onChange={(e) => field('isActive', e.target.checked)}
                className="rounded border-gray-300 text-brand focus:ring-brand" />
              Active (visible in product catalog)
            </label>

            {saveError && <p className="text-sm text-red-600">{saveError}</p>}

            <div className="flex gap-3">
              <Button variant="primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Product'}</Button>
              <Button variant="secondary" type="button" onClick={() => { setShowForm(false); setSaveError(''); setForm(blankForm); }}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <h2 className="text-sm font-semibold text-gray-700 mb-3">Products</h2>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {[
                  'Product Name', 'SKU', 'Category', 'Billing', 'Price', 'Unit',
                  ...(isAdmin ? ['Status'] : []),
                ].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && products.map((p) => (
                <tr key={p.id} onClick={() => router.push(`/products/${p.id}`)} className={`hover:bg-gray-50 cursor-pointer ${p.is_active === false ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.sku}</td>
                  <td className="px-4 py-3"><Badge variant="gray">{p.category_code}</Badge></td>
                  <td className="px-4 py-3">
                    {p.billing_kind === 'recurring'
                      ? <Badge variant="blue">Recurring</Badge>
                      : <Badge variant="gray">One-Time</Badge>}
                  </td>
                  <td className="px-4 py-3 text-gray-700">${Number(p.list_price).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500">{p.unit_name}</td>
                  {isAdmin && (
                    <td className="px-4 py-3">
                      {p.is_active === false
                        ? <Badge variant="gray">Inactive</Badge>
                        : <Badge variant="green">Active</Badge>}
                    </td>
                  )}
                </tr>
              ))}
              {!loading && products.length === 0 && !error && (
                <tr><td colSpan={isAdmin ? 7 : 6} className="px-4 py-8 text-center text-gray-400">No products found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
