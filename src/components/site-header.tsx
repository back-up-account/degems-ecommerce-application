import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { ArrowRight, LayoutDashboard, Search, ShoppingBag, User2 } from 'lucide-react';
import { authConfig } from '@/lib/auth';
import { departments } from '@/lib/departments';
import { isStaffRole } from '@/lib/admin-permissions';

export async function SiteHeader() {
  const session = await getServerSession(authConfig);
  const isStaff = Boolean(session?.user.id && isStaffRole(session.user.role));

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200 bg-white/90 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-900 text-sm font-semibold text-white">
            D
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-stone-500">Everyday Living. Made Better.</p>
            <Link href="/" className="text-lg font-semibold tracking-[0.18em] text-stone-900">
              DEGEMS
            </Link>
          </div>
        </div>

        <nav className="hidden items-center gap-7 text-sm font-medium text-stone-700 lg:flex">
          <Link href="/">Home</Link>
          {departments.map((department) => (
            <Link key={department.slug} href={`/products?category=${department.slug}`}>{department.name}</Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/products" aria-label="Search products" className="hidden rounded-full border border-stone-200 p-2 text-stone-700 transition hover:border-stone-300 sm:inline-flex">
            <Search className="h-4 w-4" />
          </Link>
          <Link href="/account" className="hidden items-center gap-2 rounded-full border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-300 sm:inline-flex">
            <User2 className="h-4 w-4" />
            Account
          </Link>
          {isStaff ? (
            <Link href="/admin" className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-300">
              <LayoutDashboard className="h-4 w-4" />
              {session?.user.role === 'ADMIN' ? 'Admin' : 'Staff portal'}
            </Link>
          ) : null}
          <Link href="/cart" className="inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-700">
            <ShoppingBag className="h-4 w-4" />
            Cart
          </Link>
        </div>
      </div>

      <div className="border-t border-stone-200 bg-stone-50/80">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 text-sm text-stone-600 sm:px-6 lg:px-8">
          <p>Everyday Living. Made Better.</p>
          <Link href="/products" className="inline-flex items-center gap-1 font-medium text-stone-900">
            Shop best sellers
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
