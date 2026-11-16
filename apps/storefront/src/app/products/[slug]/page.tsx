import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ShieldCheck, Truck } from 'lucide-react';
import { AddToCartButton } from '@/components/add-to-cart-button';
import { ProductGallery } from '@/components/product-gallery';
import { formatNairaFromKobo } from '@api/lib/utils';
import { getCatalogProduct } from '@storefront/lib/catalog-api';

export const dynamic = 'force-dynamic';

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = await getCatalogProduct(slug);
  if (!product) notFound();

  return (
    <main className="mx-auto w-full max-w-[88rem] px-4 py-7 sm:px-6 sm:py-10 lg:px-10 lg:py-12">
      <Link href="/products" className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-stone-600">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to catalogue
      </Link>
      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10">
        <div className="storefront-product-gallery">
          <ProductGallery name={product.name} images={[product.image, ...product.gallery]} />
        </div>
        <section className="space-y-6 rounded-[1.75rem] border border-stone-200 bg-white p-5 shadow-sm sm:rounded-[2rem] sm:p-8">
          <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-stone-600">
            {product.category}
          </span>
          <div>
            <h1 className="text-4xl font-semibold tracking-tight">{product.name}</h1>
            <p className="mt-3 text-lg text-stone-600">{product.description}</p>
          </div>
          <div className="flex items-end gap-4">
            <p className="text-4xl font-semibold">{formatNairaFromKobo(product.price)}</p>
            <p className="pb-1 text-sm text-stone-500">{product.inStock ? 'Available' : 'Out of stock'}</p>
          </div>
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">
            <p className="flex items-center gap-3"><Truck className="h-4 w-4" aria-hidden="true" /> Delivery options and fees are confirmed during checkout.</p>
            <p className="mt-3 flex items-center gap-3"><ShieldCheck className="h-4 w-4" aria-hidden="true" /> Availability is checked by the DEGEMS backend.</p>
          </div>
          {product.features.length > 0 ? (
            <ul className="space-y-2 text-sm text-stone-600">
              {product.features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
          ) : null}
          <AddToCartButton productId={product.id} available={product.inStock} stock={product.stock} variants={product.variants} />
        </section>
      </div>
    </main>
  );
}
