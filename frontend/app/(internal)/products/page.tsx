'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PageHeader, StatCard, Badge, Card } from '@/components/ui';

interface Product {
  id: string;
  name: string;
  sku: string;
  list_price: number;
  unit_name: string;
  category_code: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ data: Product[] }>('/sales-rep/quotations/meta/products')
      .then((r) => setProducts(Array.isArray(r.data) ? r.data : []))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <PageHeader title="Product Catalog" subtitle="Every product and price list in one place." />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Products" value={loading ? '…' : products.length} sub="active in catalog" />
        <StatCard label="Categories" value={loading ? '…' : [...new Set(products.map((p) => p.category_code))].length} sub="product categories" />
        <StatCard label="Avg List Price" value={loading || products.length === 0 ? '…' : `$${(products.reduce((s, p) => s + Number(p.list_price), 0) / products.length).toFixed(0)}`} sub="across active products" />
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Could not reach backend: {error}
        </div>
      )}

      <h2 className="text-sm font-semibold text-gray-700 mb-3">Products</h2>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Product Name', 'SKU', 'Category', 'Price', 'Unit'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && products.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.sku}</td>
                  <td className="px-4 py-3"><Badge variant="gray">{p.category_code}</Badge></td>
                  <td className="px-4 py-3 text-gray-700">${Number(p.list_price).toLocaleString()}{p.unit_name === 'Recurring' ? '/mo' : ''}</td>
                  <td className="px-4 py-3 text-gray-500">{p.unit_name}</td>
                </tr>
              ))}
              {!loading && products.length === 0 && !error && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No products found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
