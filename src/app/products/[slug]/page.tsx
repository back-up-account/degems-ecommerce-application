import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Truck } from 'lucide-react';
import { notFound } from 'next/navigation';
import { AddToCartButton } from '@/components/add-to-cart-button';
import { ProductGallery } from '@/components/product-gallery';
import { getPublishedProductBySlug } from '@/lib/catalog';
import { formatNairaFromKobo } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getPublishedProductBySlug(slug);

  if (!product) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link href="/products" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-600">
        <ArrowLeft className="h-4 w-4" />
        Back to catalogue
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <ProductGallery name={product.name} images={[product.image, ...product.gallery]} />

        <div className="space-y-6 rounded-[2rem] border border-stone-200 bg-white p-6 shadow-sm">
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-stone-600">
            {product.category}
          </span>
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-stone-900">{product.name}</h1>
            <p className="mt-3 text-lg text-stone-600">{product.description}</p>
          </div>
          <div className="flex items-end gap-4">
            <p className="text-4xl font-semibold text-stone-900">{formatNairaFromKobo(product.price)}</p>
            <p className="pb-1 text-sm text-stone-500">{product.inStock ? 'Available' : 'Out of stock'}</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
            <div className="flex items-center gap-3">
              <Truck className="h-4 w-4 text-stone-900" />
              Delivery options and fees are confirmed during checkout.
            </div>
            <div className="mt-3 flex items-center gap-3">
              <ShieldCheck className="h-4 w-4 text-stone-900" />
              Product availability is based on the store catalogue.
            </div>
          </div>
          {product.features.length > 0 ? (
            <div>
              <h2 className="mb-3 text-lg font-semibold text-stone-900">Department</h2>
              <ul className="space-y-2 text-sm text-stone-600">
                {product.features.map((feature) => <li key={feature}>{feature}</li>)}
              </ul>
            </div>
          ) : null}
          <AddToCartButton productId={product.id} available={product.inStock} variants={product.variants} />
        </div>
      </div>
    </main>
  );
}
