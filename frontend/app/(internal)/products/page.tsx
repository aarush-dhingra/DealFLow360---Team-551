'use client';

import { useRouter } from 'next/navigation';
import { products } from '@/lib/data';
import { PageHeader, StatCard, Badge, InfoBanner, Button, Card, Table, Tr, Td } from '@/components/ui';

export default function ProductsPage() {
  const router = useRouter();

  return (
    <div>
      <PageHeader title="Product Catalog" subtitle="Every product, variant and price list in one place." />

      <div className="flex items-center gap-3 mb-6">
        <Button variant="primary">+ New Product</Button>
        <Button variant="secondary">Manage Price Fields</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Products" value={products.length} sub={`${products.length} active, 6 archived`} />
        <StatCard label="Pricelists" value="3" sub="3 tiers, 2 Currencies" />
        <StatCard label="Variants" value="340 SKUs" sub="340 SKUs across all products" />
      </div>

      <h2 className="text-sm font-semibold text-gray-700 mb-3">Products</h2>
      <Card className="mb-4">
        <Table headers={['Product Name', 'Category', 'Variants', 'Price', 'Unit', 'Tax', 'Status']}>
          {products.map((p) => (
            <Tr key={p.id} onClick={() => router.push(`/products/${p.id}`)} clickable>
              <Td className="font-medium text-gray-900">{p.name}</Td>
              <Td><Badge variant="gray">{p.category}</Badge></Td>
              <Td className="text-gray-500">{p.variants}</Td>
              <Td>${p.price}{p.subscription ? '/mo' : ''}</Td>
              <Td className="text-gray-500">{p.unit}</Td>
              <Td className="text-gray-500">{p.tax}</Td>
              <Td><Badge variant="green">{p.status}</Badge></Td>
            </Tr>
          ))}
        </Table>
      </Card>

      <InfoBanner>Click a product row to open general info, variants and tier/currency price lists.</InfoBanner>
    </div>
  );
}
