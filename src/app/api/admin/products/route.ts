import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeAdminPermission } from '@/lib/admin-api-auth';
import { hasAdminPermission } from '@/lib/admin-permissions';
import {
  adjustProductStock,
  adjustVariantStock,
  AdminProductRequestError,
  updateProductDetails,
} from '@/lib/admin-products';
import { departments } from '@/lib/departments';
import { instrumentHttpHandler } from '@/lib/http-metrics';
import { prisma } from '@/lib/prisma';
import { createProductSlug } from '@/lib/product-slug';
import { productInputSchema, productUpdateSchema } from '@/lib/product-validation';

const patchSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'),
    productId: z.string().uuid(),
    product: productUpdateSchema,
  }),
  z.object({
    action: z.literal('adjust_stock'),
    productId: z.string().uuid(),
    adjustment: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0),
    reason: z.string().trim().min(5).max(500),
  }),
  z.object({
    action: z.literal('adjust_variant_stock'),
    variantId: z.string().uuid(),
    adjustment: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0),
    reason: z.string().trim().min(5).max(500),
  }),
]);

async function postProduct(request: Request) {
  const authorization = await authorizeAdminPermission('catalog.manage');
  if ('response' in authorization) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = productInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Check the product details and try again.', errors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const input = parsed.data;
  if (!hasAdminPermission(authorization.role, 'inventory.adjust')
    && (input.stock > 0 || input.variants.some((variant) => variant.stock > 0))) {
    return NextResponse.json(
      { message: 'Catalog staff cannot set inventory. Ask inventory staff to update stock after saving the listing.' },
      { status: 403 },
    );
  }
  const department = departments.find((item) => item.slug === input.categorySlug);

  if (!department) {
    return NextResponse.json({ message: 'Choose a supported DEGEMS department.' }, { status: 400 });
  }
  const slug = createProductSlug(input.name, input.sku);

  try {
    const product = await prisma.$transaction(async (transaction) => {
      const submittedSkus = [input.sku, ...input.variants.map((variant) => variant.sku)];
      const duplicateProduct = await transaction.product.findFirst({
        where: { sku: { in: input.variants.map((variant) => variant.sku) } },
        select: { id: true },
      });
      const duplicateVariant = await transaction.productVariant.findFirst({
        where: { sku: { in: submittedSkus } },
        select: { id: true },
      });
      if (duplicateProduct || duplicateVariant) {
        throw new AdminProductRequestError('That SKU is already in use. Enter unique product and variant SKUs.', 409);
      }

      const category = await transaction.category.upsert({
        where: { slug: department.slug },
        create: {
          name: department.name,
          slug: department.slug,
          description: department.description,
        },
        update: {
          name: department.name,
          description: department.description,
        },
      });

      return transaction.product.create({
        data: {
          name: input.name,
          slug,
          shortDescription: input.shortDescription,
          description: input.description,
          price: input.price,
          compareAtPrice: input.compareAtPrice ?? null,
          image: input.image,
          gallery: input.gallery,
          subcategory: input.subcategory || null,
          sku: input.sku,
          stock: input.variants.some((variant) => variant.active) ? 0 : input.stock,
          featured: input.featured,
          published: input.published,
          categoryId: category.id,
          variants: {
            create: input.variants.map((variant) => ({
              name: variant.name,
              sku: variant.sku,
              price: variant.price ?? null,
              stock: variant.stock,
              active: variant.active,
            })),
          },
        },
        select: { id: true, name: true, slug: true, published: true },
      });
    });

    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof AdminProductRequestError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { message: 'That SKU is already in use. Enter a unique SKU.' },
        { status: 409 },
      );
    }

    throw error;
  }
}

async function patchProduct(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Check the product details or stock adjustment and try again.' }, { status: 400 });
  }

  try {
    if (parsed.data.action === 'update') {
      const authorization = await authorizeAdminPermission('catalog.manage');
      if ('response' in authorization) return authorization.response;

      let productInput = parsed.data.product;
      if (!hasAdminPermission(authorization.role, 'inventory.adjust')) {
        const existing = await prisma.product.findUnique({
          where: { id: parsed.data.productId },
          select: { stock: true },
        });
        if (!existing) return NextResponse.json({ message: 'Product not found.' }, { status: 404 });
        if (parsed.data.product.variants.some((variant) => !variant.id && variant.stock > 0)) {
          return NextResponse.json(
            { message: 'Catalog staff cannot set or adjust inventory.' },
            { status: 403 },
          );
        }
        productInput = { ...parsed.data.product, stock: existing.stock };
      }

      const product = await updateProductDetails(parsed.data.productId, productInput);
      return NextResponse.json({ product });
    }

    if (parsed.data.action === 'adjust_variant_stock') {
      const authorization = await authorizeAdminPermission('inventory.adjust');
      if ('response' in authorization) return authorization.response;
      const result = await adjustVariantStock(
        parsed.data.variantId,
        parsed.data.adjustment,
        parsed.data.reason,
        authorization.userId,
      );
      return NextResponse.json(result);
    }

    const authorization = await authorizeAdminPermission('inventory.adjust');
    if ('response' in authorization) return authorization.response;
    const result = await adjustProductStock(
      parsed.data.productId,
      parsed.data.adjustment,
      parsed.data.reason,
      authorization.userId,
    );
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AdminProductRequestError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return NextResponse.json({ message: 'That SKU or product URL is already in use.' }, { status: 409 });
      }
      if (error.code === 'P2025') {
        return NextResponse.json({ message: 'Product not found.' }, { status: 404 });
      }
      if (error.code === 'P2034') {
        return NextResponse.json(
          { message: 'Product changed at the same time. Reload and try again.' },
          { status: 409 },
        );
      }
    }

    throw error;
  }
}

export const POST = instrumentHttpHandler('/api/admin/products', 'POST', postProduct);
export const PATCH = instrumentHttpHandler('/api/admin/products', 'PATCH', patchProduct);
