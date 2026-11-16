import Link from 'next/link';
import { ProductCard } from '@storefront/components/product-card';
import { departments } from '@api/lib/departments';
import { listCatalogProducts } from '@storefront/lib/catalog-api';

export const dynamic = 'force-dynamic';

export default async function ProductCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await searchParams;
  const { configured, products } = await listCatalogProducts({ category, search: q });

  return (
    <main className="mx-auto w-full max-w-[88rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-12">
      <div className="mb-8 sm:mb-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-degems-brand">The DEGEMS collection</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">Everyday essentials</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
          Thoughtful finds for home, family, and everyday living.
        </p>
      </div>
      <section aria-label="Shop by category" className="mb-7 flex flex-wrap gap-2 sm:mb-8 sm:gap-3">
        <Link href="/products" className={`rounded-full border px-4 py-2 text-sm transition-colors ${!category ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white hover:bg-stone-100'}`}>
          All departments
        </Link>
        {departments.map((department) => (
          <Link
            key={department.slug}
            href={`/products?category=${department.slug}`}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${category === department.slug ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white hover:bg-stone-100'}`}
          >
            {department.name}
          </Link>
        ))}
      </section>
      <form action="/products" className="mb-8 flex max-w-3xl gap-3 rounded-2xl border border-stone-200 bg-white p-3 shadow-sm sm:rounded-3xl sm:p-4">
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <label className="sr-only" htmlFor="product-search">Search products</label>
        <input id="product-search" name="q" defaultValue={q} placeholder="Search products" className="min-w-0 flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-900 placeholder:text-stone-600" />
        <button type="submit" className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-700">Search</button>
      </form>

      {!configured ? (
        <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm">
          The product catalogue is not connected yet.
        </p>
      ) : products.length ? (
        <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600 sm:p-10">
          {q || category ? 'No matching products yet.' : 'Our first collection is coming soon.'}
        </p>
      )}
    </main>
  );
}
