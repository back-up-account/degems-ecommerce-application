import { headers } from 'next/headers';
import { z } from 'zod';
import type { CartView } from '@api/lib/cart';
import type { ActiveDeliveryZone } from '@api/lib/delivery';
import type { StoreProduct } from '@api/lib/catalog';

const productSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  price: z.number().int(),
  stock: z.number().int(),
  image: z.string(),
  gallery: z.array(z.string()),
  badge: z.string().optional(),
  featured: z.boolean(),
  description: z.string(),
  inStock: z.boolean(),
  features: z.array(z.string()),
  variants: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number().int(),
    stock: z.number().int(),
  })),
});

const cartSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    productId: z.string(),
    variantId: z.string().nullable(),
    variantName: z.string().nullable(),
    slug: z.string(),
    name: z.string(),
    image: z.string(),
    price: z.number().int(),
    stock: z.number().int(),
    quantity: z.number().int(),
    available: z.boolean(),
  })),
  itemCount: z.number().int(),
  subtotal: z.number().int(),
});

const deliveryZonesSchema = z.object({
  zones: z.array(z.object({
    id: z.string(),
    name: z.string(),
    deliveryFee: z.number().int(),
  })),
});

export class BackendApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackendApiError';
  }
}

export function getBackendApiOrigin() {
  const configuredUrl = process.env.BACKEND_API_URL
    ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:3003' : undefined);
  if (!configuredUrl) {
    throw new BackendApiError('BACKEND_API_URL must be configured for the storefront deployment.');
  }

  const url = new URL(configuredUrl);
  if (url.username || url.password || url.pathname !== '/'
    || (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')) {
    throw new BackendApiError('BACKEND_API_URL must be an HTTPS origin without credentials or a path in production.');
  }

  return url.origin;
}

export async function listCatalogProducts(filters: {
  category?: string;
  search?: string;
} = {}): Promise<{ configured: boolean; products: StoreProduct[] }> {
  const url = new URL('/api/catalog/products', getBackendApiOrigin());
  if (filters.category) url.searchParams.set('category', filters.category);
  if (filters.search) url.searchParams.set('q', filters.search);

  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 503) return { configured: false, products: [] };
  if (!response.ok) throw new BackendApiError(`Product catalogue request failed (${response.status}).`);

  const result = z.object({ products: z.array(productSchema) }).safeParse(await response.json());
  if (!result.success) throw new BackendApiError('Product catalogue response was invalid.');
  return { configured: true, products: result.data.products };
}

export async function getCatalogProduct(slug: string): Promise<StoreProduct | null> {
  const url = new URL(`/api/catalog/products/${encodeURIComponent(slug)}`, getBackendApiOrigin());
  const response = await fetch(url, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (response.status === 503) throw new BackendApiError('Product catalogue is not configured.');
  if (!response.ok) throw new BackendApiError(`Product request failed (${response.status}).`);

  const result = z.object({ product: productSchema }).safeParse(await response.json());
  if (!result.success) throw new BackendApiError('Product response was invalid.');
  return result.data.product;
}

export async function getCart(): Promise<{ configured: boolean; cart: CartView }> {
  const requestHeaders = await headers();
  const cookie = requestHeaders.get('cookie');
  const response = await fetch(new URL('/api/cart', getBackendApiOrigin()), {
    headers: cookie ? { cookie } : undefined,
    cache: 'no-store',
  });
  if (response.status === 503) {
    return { configured: false, cart: { items: [], itemCount: 0, subtotal: 0 } };
  }
  if (!response.ok) throw new BackendApiError(`Cart request failed (${response.status}).`);

  const result = cartSchema.safeParse(await response.json());
  if (!result.success) throw new BackendApiError('Cart response was invalid.');
  return { configured: true, cart: result.data };
}

export async function getActiveDeliveryZones(): Promise<{
  configured: boolean;
  zones: ActiveDeliveryZone[];
}> {
  const response = await fetch(new URL('/api/delivery-zones', getBackendApiOrigin()), { cache: 'no-store' });
  if (response.status === 503) return { configured: false, zones: [] };
  if (!response.ok) throw new BackendApiError(`Delivery options request failed (${response.status}).`);

  const result = deliveryZonesSchema.safeParse(await response.json());
  if (!result.success) throw new BackendApiError('Delivery options response was invalid.');
  return { configured: true, zones: result.data.zones };
}
