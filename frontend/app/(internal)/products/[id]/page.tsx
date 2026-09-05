'use client';

import { useParams, useRouter } from 'next/navigation';
import { products } from '@/lib/data';
import { PageHeader, InfoBanner, Button, Card, Table, Tr, Td } from '@/components/ui';

const variants = [
  { attribute: 'Color', values: 'Blue, Black', extraPrice: '0' },
  { attribute: 'RAM', values: '4GB, 8GB', extraPrice: '+$30' },
  { attribute: 'Manufacturer', values: 'Dell, HP', extraPrice: '+$10/+$30' },
];

const pricelists = [
  { tier: 'Bronze', currency: 'USD', priceRule: 'Price, no adjustment' },
  { tier: 'Gold', currency: 'USD/EUR', priceRule: 'Price minus 10% base' },
];

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const product = products.find((p) => p.id === id);

  if (!product) return <div className="p-8 text-gray-500">Product not found.</div>;

  return (
    <div className="max-w-3xl">
      <button onClick={() => router.back()} className="text-sm text-gray-400 hover:text-gray-600 mb-2">← Back</button>
      <PageHeader title="Product and Pricelist" subtitle={product.name} />

      {/* General Info */}
      <Card className="p-5 mb-5">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">General Info</h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: 'Product name', value: product.name },
            { label: 'Tax %', value: product.tax },
            { label: 'Category', value: product.category },
            { label: 'Subscription', value: product.subscription ? 'Yes' : 'No' },
            { label: 'Price', value: `$${product.price}` },
            { label: 'Recurring', value: product.subscription ? 'Monthly/Yearly/Weekly' : 'N/A' },
            { label: 'Unit', value: product.unit },
            { label: 'Quantity on hand', value: '-' },
            { label: 'Description', value: '-' },
          ].map((field) => (
            <div key={field.label}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{field.label}</label>
              <div className="px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700">
                {field.value}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Product Variants */}
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Product Variants</h2>
      <Card className="mb-5">
        <Table headers={['Attribute', 'Values', 'Extra Price']}>
          {variants.map((v, i) => (
            <Tr key={i}>
              <Td className="font-medium">{v.attribute}</Td>
              <Td className="text-gray-600">{v.values}</Td>
              <Td>{v.extraPrice}</Td>
            </Tr>
          ))}
        </Table>
      </Card>

      {/* Pricelists */}
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Pricelists</h2>
      <Card className="mb-5">
        <Table headers={['Tier', 'Currency', 'Price Rule']}>
          {pricelists.map((pl, i) => (
            <Tr key={i}>
              <Td className="font-medium">{pl.tier}</Td>
              <Td className="text-gray-600">{pl.currency}</Td>
              <Td className="text-gray-600">{pl.priceRule}</Td>
            </Tr>
          ))}
        </Table>
      </Card>

      <InfoBanner>
        Product details should be filled.<br />
        Recurring order with this product will be invoiced at the beginning of the period.
      </InfoBanner>

      <div className="mt-5 flex gap-3">
        <Button variant="primary">Save</Button>
        <Button variant="secondary">Cancel</Button>
      </div>
    </div>
  );
}
