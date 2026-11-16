import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { StoreProduct } from '@api/lib/catalog';
import { formatNairaFromKobo } from '@api/lib/utils';

export function ProductCard({ product }: { product: StoreProduct }) {
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white transition duration-200 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-[0_14px_34px_rgba(23,59,48,0.10)] focus-within:ring-2 focus-within:ring-degems-brand focus-within:ring-offset-2 sm:rounded-3xl">
      <Link href={`/products/${product.slug}`} className="relative block aspect-square overflow-hidden bg-stone-50" aria-label={`View ${product.name}`}>
        <Image
          src={product.image}
          alt={product.name}
          width={800}
          height={800}
          unoptimized
          className="h-full w-full object-contain p-4 transition-transform duration-300 motion-safe:group-hover:scale-[1.025] sm:p-6"
        />
        {product.badge ? (
          <span className="absolute left-3 top-3 rounded-full bg-degems-sage px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-degems-brand sm:left-4 sm:top-4">
            {product.badge}
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-600 sm:text-xs">
            {product.category}
          </p>
          <p className="shrink-0 text-[11px] font-medium text-stone-600">
            {product.inStock ? 'In stock' : 'Out of stock'}
          </p>
        </div>

        <h2 className="line-clamp-2 min-h-12 text-base font-semibold leading-6 text-stone-900 sm:text-lg">
          <Link href={`/products/${product.slug}`} className="rounded-sm transition-colors hover:text-degems-brand">
            {product.name}
          </Link>
        </h2>
        <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-5 text-stone-600 sm:text-sm">
          {product.description}
        </p>

        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div className="min-w-0">
            <p className="text-lg font-semibold tracking-tight text-stone-900 sm:text-xl">
              {formatNairaFromKobo(product.price)}
            </p>
            {product.variants.length > 0 ? (
              <p className="mt-0.5 text-xs text-stone-600">Starting price</p>
            ) : null}
          </div>
          <Link
            href={`/products/${product.slug}`}
            className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-degems-brand transition-colors hover:bg-degems-sage sm:px-4 sm:text-sm"
            aria-label={`View ${product.name} details`}
          >
            View <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}
