import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { StoreProduct } from '@/lib/catalog';
import { formatNairaFromKobo } from '@/lib/utils';

export function ProductCard({ product }: { product: StoreProduct }) {
  return (
    <article className="group overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-[0_14px_50px_rgba(28,25,23,0.08)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_55px_rgba(28,25,23,0.12)]">
      <div className="relative overflow-hidden">
        <Image
          src={product.image}
          alt={product.name}
          width={800}
          height={800}
          unoptimized
          className="h-72 w-full object-cover transition duration-500 group-hover:scale-105"
        />
        {product.badge ? (
          <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-stone-700">
            {product.badge}
          </span>
        ) : null}
      </div>

      <div className="space-y-5 p-5">
        <div className="flex items-center justify-between gap-3 text-xs text-stone-500">
          <span>{product.category}</span>
          <span>{product.inStock ? 'In stock' : 'Out of stock'}</span>
        </div>

        <div className="space-y-2">
          <Link href={`/products/${product.slug}`} className="text-xl font-semibold text-stone-900 transition hover:text-stone-600">
            {product.name}
          </Link>
          <p className="text-sm leading-6 text-stone-600">{product.description}</p>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-2xl font-semibold text-stone-900">{formatNairaFromKobo(product.price)}</p>
            <p className="text-xs text-stone-500">{product.variants.length > 0 ? 'Starting price' : 'Price in NGN'}</p>
          </div>
          <Link
            href={`/products/${product.slug}`}
            className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700"
          >
            View item
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
