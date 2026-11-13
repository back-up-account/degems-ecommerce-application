import { CartContents } from '@/components/cart-contents';
import { CartNotConfiguredError, readCurrentCart, type CartView } from '@/lib/cart';

export const dynamic = 'force-dynamic';

export default async function CartPage() {
  let cart: CartView | null = null;
  let databaseConfigured = true;

  try {
    cart = await readCurrentCart();
  } catch (error) {
    if (error instanceof CartNotConfiguredError) {
      databaseConfigured = false;
    } else {
      throw error;
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="mb-2 text-xs uppercase tracking-[0.28em] text-stone-500">Your cart</p>
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900">Shopping bag</h1>
      </div>
      {databaseConfigured && cart ? (
        <CartContents initialCart={cart} />
      ) : (
        <div role="status" className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-10 text-center">
          <h2 className="text-xl font-semibold text-stone-900">The product database is not connected.</h2>
          <p className="mt-2 text-sm text-stone-600">Configure PostgreSQL using the README runbook before using the cart.</p>
        </div>
      )}
    </main>
  );
}
