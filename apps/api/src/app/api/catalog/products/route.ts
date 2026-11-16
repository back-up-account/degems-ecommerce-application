import { NextResponse } from 'next/server';
import {
  CatalogNotConfiguredError,
  listPublishedProducts,
} from '@api/lib/catalog';
import { instrumentHttpHandler } from '@api/lib/http-metrics';

async function getProducts(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const category = searchParams.get('category') ?? undefined;
  const search = searchParams.get('q') ?? undefined;
  const featuredOnlyValue = searchParams.get('featuredOnly');

  if ((category !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category))
    || (search !== undefined && search.length > 120)
    || (featuredOnlyValue !== null && featuredOnlyValue !== 'true' && featuredOnlyValue !== 'false')) {
    return NextResponse.json({ message: 'Invalid catalogue filters.' }, { status: 400 });
  }

  try {
    const products = await listPublishedProducts({
      category,
      search,
      featuredOnly: featuredOnlyValue === 'true',
    });

    return NextResponse.json({ products }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof CatalogNotConfiguredError) {
      return NextResponse.json({ message: 'Product catalogue is not configured.' }, { status: 503 });
    }

    throw error;
  }
}

export const GET = instrumentHttpHandler('/api/catalog/products', 'GET', getProducts);
