import Link from 'next/link';
import { ArrowRight, BadgeCheck, ShieldCheck, Sparkles } from 'lucide-react';
import { ProductCard } from '@/components/product-card';
import { CatalogNotConfiguredError, listPublishedProducts, type StoreProduct } from '@/lib/catalog';
import { benefits, departments } from '@/lib/departments';

export const dynamic = 'force-dynamic';

export default async function Home() {
  let catalogueConfigured = true;
  let featuredProducts: StoreProduct[] = [];

  try {
    featuredProducts = await listPublishedProducts({ featuredOnly: true });
  } catch (error) {
    if (error instanceof CatalogNotConfiguredError) {
      catalogueConfigured = false;
    } else {
      throw error;
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <main>
        <section className="mx-auto max-w-7xl px-4 pb-14 pt-12 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs uppercase tracking-[0.24em] text-stone-600">
                <Sparkles className="h-3.5 w-3.5" />
                Everyday Living. Made Better.
              </div>
              <div className="space-y-5">
                <h1 className="max-w-xl text-5xl font-semibold tracking-[-0.06em] text-stone-900 sm:text-6xl">
                  Practical essentials, thoughtfully chosen.
                </h1>
                <p className="max-w-lg text-lg leading-8 text-stone-600">
                  Discover useful kitchen, home appliance, wellness, and children’s products selected to make everyday life a little easier.
                </p>
              </div>
              <Link
                href="/products"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-stone-700"
              >
                Explore departments
                <ArrowRight className="h-4 w-4" />
              </Link>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-stone-600">
                <span className="inline-flex items-center gap-2">
                  <BadgeCheck className="h-4 w-4 text-emerald-700" />
                  Quality-led selection
                </span>
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                  Clear product information
                </span>
              </div>
            </div>

            <div className="rounded-[2rem] border border-stone-200 bg-white p-6 shadow-[0_22px_60px_rgba(28,25,23,0.1)] sm:p-8">
              <p className="text-xs uppercase tracking-[0.28em] text-stone-500">The DEGEMS edit</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-stone-900">Useful by design.</h2>
              <p className="mt-3 max-w-lg text-sm leading-6 text-stone-600">
                A growing catalogue across four everyday departments. Products are added by the DEGEMS store owner and shown here when published.
              </p>
              <div className="mt-7 grid grid-cols-2 gap-3">
                {departments.map((department, index) => (
                  <Link
                    key={department.slug}
                    href={`/products?category=${department.slug}`}
                    className={`min-h-28 rounded-2xl p-4 text-white transition hover:brightness-110 ${index % 2 === 0 ? 'bg-stone-800' : 'bg-stone-600'}`}
                  >
                    <span className="text-xs uppercase tracking-[0.18em] text-stone-300">0{index + 1}</span>
                    <span className="mt-4 block text-lg font-semibold">{department.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-stone-200 bg-white/70">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="mb-8">
              <p className="mb-2 text-xs uppercase tracking-[0.28em] text-stone-500">Shop by department</p>
              <h2 className="text-3xl font-semibold tracking-tight text-stone-900">Made for everyday needs</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {departments.map((department) => (
                <Link
                  key={department.slug}
                  href={`/products?category=${department.slug}`}
                  className="rounded-[2rem] border border-stone-200 bg-white p-5 transition hover:border-stone-400 hover:shadow-sm"
                >
                  <h3 className="text-xl font-semibold text-stone-900">{department.name}</h3>
                  <p className="mt-2 text-sm leading-6 text-stone-600">{department.description}</p>
                  <p className="mt-4 text-xs leading-5 text-stone-500">{department.subcategories.join(' · ')}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.28em] text-stone-500">Featured</p>
              <h2 className="text-3xl font-semibold tracking-tight text-stone-900">Selected by DEGEMS</h2>
            </div>
            <Link href="/products" className="inline-flex items-center gap-2 text-sm font-medium text-stone-700">
              Browse catalogue
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {!catalogueConfigured ? (
            <div role="status" className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-8 text-center">
              <p className="font-medium text-stone-900">The product catalogue is not connected yet.</p>
              <p className="mt-2 text-sm text-stone-600">Configure PostgreSQL as described in the README runbook to add and display your listings.</p>
            </div>
          ) : featuredProducts.length ? (
            <div className="grid gap-6 lg:grid-cols-3">
              {featuredProducts.slice(0, 3).map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
              <p className="text-lg font-medium text-stone-900">The first featured products will be here soon.</p>
              <p className="mt-2 text-sm text-stone-600">This catalogue is intentionally empty until the store owner adds products.</p>
            </div>
          )}
        </section>

        <section className="bg-stone-900 py-16 text-white">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8">
              <p className="mb-2 text-xs uppercase tracking-[0.28em] text-stone-300">The DEGEMS promise</p>
              <h2 className="text-3xl font-semibold tracking-tight text-white">Better choices for everyday living.</h2>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {benefits.map((benefit) => (
                <div key={benefit.title} className="rounded-[2rem] border border-white/10 bg-white/5 p-5">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-stone-200">
                    {benefit.icon === 'arrow' ? <ArrowRight className="h-4 w-4" /> : null}
                    {benefit.icon === 'badge' ? <BadgeCheck className="h-4 w-4" /> : null}
                    {benefit.icon === 'sparkles' ? <Sparkles className="h-4 w-4" /> : null}
                  </div>
                  <h3 className="mb-2 text-xl font-semibold text-white">{benefit.title}</h3>
                  <p className="text-sm leading-6 text-stone-300">{benefit.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 text-sm text-stone-600 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="text-lg font-semibold tracking-[0.2em] text-stone-900">DEGEMS</p>
            <p className="mt-2">Everyday Living. Made Better.</p>
          </div>
          <div className="flex gap-6">
            <Link href="/products">Shop</Link>
            <Link href="/account">Account</Link>
            <Link href="/cart">Cart</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
