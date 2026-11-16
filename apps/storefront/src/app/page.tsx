import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { formatNairaFromKobo } from '@api/lib/utils';
import { ProductCard } from '@storefront/components/product-card';
import { listCatalogProducts } from '@storefront/lib/catalog-api';

export const dynamic = 'force-dynamic';

export default async function StorefrontHomePage() {
  const { configured, products } = await listCatalogProducts();
  const heroProduct = products.find((product) => product.featured && product.inStock)
    ?? products.find((product) => product.inStock)
    ?? products[0];

  return (
    <main className="mx-auto w-full max-w-[88rem] px-4 py-7 sm:px-6 sm:py-10 lg:px-10 lg:py-12">
      <section className="border-b border-stone-200 py-10 sm:py-14 lg:py-16">
        <div className={`grid items-center gap-10 lg:gap-16 ${heroProduct ? 'lg:grid-cols-[0.95fr_1.05fr]' : ''}`}>
          <div className="py-1 sm:py-3">
            <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-stone-600">Everyday Living. Made Better.</p>
            <h1 className="storefront-editorial-heading mt-5 max-w-2xl text-5xl leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
              Everyday essentials, <span className="text-stone-600">thoughtfully chosen.</span>
            </h1>
            <p className="mt-6 max-w-lg text-sm leading-6 text-stone-600 sm:text-base sm:leading-7">
              Considered finds for your home, wellbeing, and family — chosen to make everyday living a little better.
            </p>
            <Link
              href="/products"
              className="mt-7 inline-flex min-h-12 items-center justify-center gap-3 border border-stone-900 bg-stone-900 px-6 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-white transition-colors hover:bg-stone-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-stone-900"
            >
              Shop the collection <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
          {heroProduct ? (
            <Link
              href={`/products/${heroProduct.slug}`}
              className="group min-w-0 overflow-hidden border border-stone-200 bg-white p-2 text-stone-900 transition-colors hover:border-stone-400 sm:p-3"
              aria-label={`View ${heroProduct.name}`}
            >
              <div className="relative aspect-[1.14] overflow-hidden bg-stone-50">
                <Image
                  src={heroProduct.image}
                  alt={heroProduct.name}
                  width={1000}
                  height={880}
                  unoptimized
                  className="h-full w-full object-contain p-5 sm:p-8"
                />
                {heroProduct.badge ? (
                  <span className="absolute left-4 top-4 border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.12em] text-stone-900">
                    {heroProduct.badge}
                  </span>
                ) : null}
              </div>
              <div className="flex items-center justify-between gap-4 px-3 py-4 sm:px-4">
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-[0.12em] text-stone-600">{heroProduct.category}</p>
                  <p className="mt-1 truncate font-semibold text-stone-900">{heroProduct.name}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-stone-900">{formatNairaFromKobo(heroProduct.price)}</p>
              </div>
            </Link>
          ) : null}
        </div>
      </section>

      <section className="py-10 sm:py-14 lg:py-16">
        <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-stone-600">The DEGEMS collection</p>
            <h2 className="storefront-editorial-heading mt-2 text-3xl tracking-tight text-stone-900 sm:text-4xl">Shop useful finds</h2>
          </div>
          <Link href="/products" className="inline-flex shrink-0 items-center gap-1.5 px-2 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-stone-900 transition-colors hover:text-stone-600">
            View all <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {!configured ? (
          <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm">
            The product catalogue is not connected yet.
          </p>
        ) : products.length ? (
          <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
            {products.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : (
          <p className="border-y border-stone-200 bg-transparent px-5 py-10 text-center text-sm text-stone-600 sm:py-14">
            New listings will appear here after they are published.
          </p>
        )}
      </section>
    </main>
  );
}
