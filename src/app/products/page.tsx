import Link from 'next/link';
import { ProductCard } from '@/components/product-card';
import { departments } from '@/lib/departments';
import { CatalogNotConfiguredError, listPublishedProducts, type StoreProduct } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

export default async function ProductCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category, q } = await searchParams;
  let catalogueConfigured = true;
  let products: StoreProduct[] = [];

  try {
    products = await listPublishedProducts({ category, search: q });
  } catch (error) {
    if (error instanceof CatalogNotConfiguredError) {
      catalogueConfigured = false;
    } else {
      throw error;
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="mb-2 text-xs uppercase tracking-[0.28em] text-stone-500">DEGEMS catalogue</p>
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900">Everyday essentials</h1>
      </div>

      <div className="mb-8 flex flex-wrap gap-3">
        <Link href="/products" className={`rounded-full border px-4 py-2 text-sm font-medium ${!category ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700'}`}>
          All departments
        </Link>
        {departments.map((department) => (
          <Link
            key={department.slug}
            href={`/products?category=${department.slug}`}
            className={`rounded-full border px-4 py-2 text-sm font-medium ${category === department.slug ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-700'}`}
          >
            {department.name}
          </Link>
        ))}
      </div>

      <form action="/products" className="mb-8 flex flex-col gap-3 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row">
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <label className="sr-only" htmlFor="product-search">Search products</label>
        <input
          id="product-search"
          name="q"
          defaultValue={q}
          placeholder="Search products"
          className="min-w-0 flex-1 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm outline-none focus:border-stone-900"
        />
        <button type="submit" className="rounded-full bg-stone-900 px-5 py-2 text-sm font-medium text-white hover:bg-stone-700">
          Search catalogue
        </button>
      </form>

      {!catalogueConfigured ? (
        <div role="status" className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-12 text-center">
          <h2 className="text-2xl font-semibold text-stone-900">The product catalogue is not connected yet</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-600">
            Configure PostgreSQL using the README runbook before uploading or publishing products.
          </p>
        </div>
      ) : products.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-16 text-center">
          <h2 className="text-2xl font-semibold text-stone-900">
            {q || category ? 'No matching products yet' : 'Our first collection is coming soon'}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-stone-600">
            DEGEMS products will appear here after they are added and published by the store owner.
          </p>
          {(q || category) ? (
            <Link href="/products" className="mt-5 inline-flex rounded-full border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700">
              Clear filters
            </Link>
          ) : null}
        </div>
      )}
    </main>
  );
}
