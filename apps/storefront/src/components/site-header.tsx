'use client';

import Link from 'next/link';
import { Search, ShoppingBag, User2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { departments } from '@api/lib/departments';
import { CART_UPDATED_EVENT } from '@api/lib/cart-events';

export function SiteHeader() {
  const [cartCount, setCartCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    let changedLocally = false;

    function handleCartUpdate(event: Event) {
      if (event instanceof CustomEvent && Number.isSafeInteger(event.detail) && event.detail >= 0) {
        changedLocally = true;
        setCartCount(event.detail);
      }
    }

    async function loadCartCount() {
      try {
        const response = await fetch('/api/cart', { cache: 'no-store' });
        const result = (await response.json()) as { itemCount?: number; message?: string };

        if (!response.ok) {
          console.error('Could not load cart count.', result.message ?? response.statusText);
          return;
        }
        if (typeof result.itemCount !== 'number' || !Number.isSafeInteger(result.itemCount) || result.itemCount < 0) {
          console.error('Cart count response was invalid.');
          return;
        }
        if (active && !changedLocally) setCartCount(result.itemCount);
      } catch (error) {
        console.error('Could not load cart count.', error);
      }
    }

    window.addEventListener(CART_UPDATED_EVENT, handleCartUpdate);
    void loadCartCount();

    return () => {
      active = false;
      window.removeEventListener(CART_UPDATED_EVENT, handleCartUpdate);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200 bg-stone-50">
      <div className="border-b border-stone-200">
        <p className="mx-auto max-w-[88rem] px-4 py-2 text-center text-[9px] font-medium uppercase tracking-[0.2em] text-stone-600 sm:px-6 sm:text-[10px] lg:px-10">
          Everyday Living. Made Better.
        </p>
      </div>
      <div className="mx-auto flex min-h-[4.5rem] max-w-[88rem] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-10">
        <Link href="/" aria-label="DEGEMS home" className="flex min-w-0 shrink-0 items-center gap-3">
          <span className="storefront-editorial-heading text-2xl tracking-[-0.06em] text-stone-900 sm:text-3xl">DEGEMS.</span>
          <span className="hidden max-w-36 text-[10px] leading-4 text-stone-600 md:block">
            Considered goods for everyday living.
          </span>
        </Link>

        <nav aria-label="Main navigation" className="hidden items-center gap-5 text-[10px] font-medium uppercase tracking-[0.16em] text-stone-700 xl:flex 2xl:gap-7">
          <Link href="/products" className="px-1 py-2 transition-colors hover:text-stone-900">Shop</Link>
          {departments.map((department) => (
            <Link
              key={department.slug}
              href={`/products?category=${department.slug}`}
              className="px-1 py-2 transition-colors hover:text-stone-900"
            >
              {department.name}
            </Link>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/products"
            aria-label="Search products"
            className="inline-flex min-h-10 items-center gap-2 border border-stone-200 px-3 text-[10px] font-medium uppercase tracking-[0.1em] text-stone-700 transition-colors hover:border-stone-400 hover:text-stone-900"
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Search</span>
          </Link>
          <Link
            href="/account"
            aria-label="Account"
            className="hidden min-h-10 min-w-10 items-center justify-center text-stone-700 transition-colors hover:text-stone-900 sm:inline-flex"
          >
            <User2 className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link
            href="/cart"
            aria-label={cartCount === null ? 'Open cart' : `Open cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}
            className="inline-flex min-h-10 min-w-10 items-center justify-center border border-stone-200 px-2.5 text-stone-900 transition-colors hover:border-stone-400"
          >
            <ShoppingBag className="h-4 w-4" aria-hidden="true" />
            {cartCount !== null ? <span className="ml-1 text-[10px]">{cartCount}</span> : null}
          </Link>
        </div>
      </div>

      <nav aria-label="Shop by department" className="storefront-mobile-nav overflow-x-auto border-t border-stone-200 bg-stone-50 xl:hidden">
        <div className="mx-auto flex w-max min-w-full max-w-[88rem] items-center gap-1 px-4 py-1.5 sm:px-6 lg:px-10">
          <Link href="/products" className="shrink-0 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-900">
            Shop all
          </Link>
          {departments.map((department) => (
            <Link
              key={department.slug}
              href={`/products?category=${department.slug}`}
              className="shrink-0 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.1em] text-stone-600 transition-colors hover:text-stone-900"
            >
              {department.name}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
