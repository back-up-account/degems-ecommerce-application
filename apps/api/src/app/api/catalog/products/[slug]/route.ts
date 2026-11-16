import { NextResponse } from 'next/server';
import {
  CatalogNotConfiguredError,
  getPublishedProductBySlug,
} from '@api/lib/catalog';
import { instrumentHttpHandler } from '@api/lib/http-metrics';

async function getProduct(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json({ message: 'Product not found.' }, { status: 404 });
  }

  try {
    const product = await getPublishedProductBySlug(slug);
    if (!product) {
      return NextResponse.json({ message: 'Product not found.' }, { status: 404 });
    }

    return NextResponse.json({ product }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof CatalogNotConfiguredError) {
      return NextResponse.json({ message: 'Product catalogue is not configured.' }, { status: 503 });
    }

    throw error;
  }
}

export const GET = instrumentHttpHandler('/api/catalog/products/[slug]', 'GET', getProduct);
