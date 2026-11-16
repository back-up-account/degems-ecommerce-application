import { CartContents } from '@/components/cart-contents';
import { getCart } from '@storefront/lib/catalog-api';

export const dynamic = 'force-dynamic';

export default async function CartPage() {
  const { configured, cart } = await getCart();

  return (
    <main className="mx-auto w-full max-w-[88rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-10 lg:py-12">
      <h1 className="mb-8 text-4xl font-semibold tracking-tight">Shopping bag</h1>
      {configured ? (
        <div className="storefront-cart-images">
          <CartContents initialCart={cart} />
        </div>
      ) : (
        <p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm">
          The product database is not connected.
        </p>
      )}
    </main>
  );
}
