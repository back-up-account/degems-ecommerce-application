import { Prisma } from '@prisma/client';
import { departments } from '@/lib/departments';
import { prisma } from '@/lib/prisma';
import { createProductSlug } from '@/lib/product-slug';
import type { ProductUpdateInput } from '@/lib/product-validation';

const MAX_STOCK = 1_000_000;

export class AdminProductRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'AdminProductRequestError';
  }
}

export async function updateProductDetails(productId: string, input: ProductUpdateInput) {
  const department = departments.find((item) => item.slug === input.categorySlug);
  if (!department) throw new AdminProductRequestError('Choose a supported DEGEMS department.', 400);

  return prisma.$transaction(async (transaction) => {
    const existingVariants = await transaction.productVariant.findMany({
      where: { productId },
      select: { id: true, sku: true },
    });
    const existingIds = new Set(existingVariants.map((variant) => variant.id));
    if (input.variants.some((variant) => variant.id && !existingIds.has(variant.id))) {
      throw new AdminProductRequestError('A selected variant does not belong to this product.', 400);
    }

    const submittedIds = new Set(input.variants.flatMap((variant) => variant.id ? [variant.id] : []));
    const otherVariant = await transaction.productVariant.findFirst({
      where: {
        sku: { in: [input.sku, ...input.variants.map((variant) => variant.sku)] },
        ...(submittedIds.size ? { id: { notIn: [...submittedIds] } } : {}),
      },
      select: { id: true },
    });
    const otherProduct = await transaction.product.findFirst({
      where: {
        sku: { in: [input.sku, ...input.variants.map((variant) => variant.sku)] },
        id: { not: productId },
      },
      select: { id: true },
    });
    if (otherVariant || otherProduct) {
      throw new AdminProductRequestError('That SKU is already in use.', 409);
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

    const product = await transaction.product.update({
      where: { id: productId },
      data: {
        name: input.name,
        slug: createProductSlug(input.name, input.sku),
        shortDescription: input.shortDescription,
        description: input.description,
        price: input.price,
        compareAtPrice: input.compareAtPrice ?? null,
        stock: input.variants.some((variant) => variant.active) ? 0 : input.stock,
        image: input.image,
        gallery: input.gallery,
        subcategory: input.subcategory || null,
        sku: input.sku,
        featured: input.featured,
        published: input.published,
        categoryId: category.id,
      },
      select: { id: true, name: true, slug: true, published: true },
    });

    for (const variant of input.variants) {
      const data = {
        name: variant.name,
        sku: variant.sku,
        price: variant.price ?? null,
        active: variant.active,
      };
      if (variant.id) {
        await transaction.productVariant.update({
          where: { id: variant.id },
          data,
        });
      } else {
        await transaction.productVariant.create({
          data: { ...data, productId, stock: variant.stock },
        });
      }
    }

    const removedVariantIds = existingVariants
      .map((variant) => variant.id)
      .filter((id) => !submittedIds.has(id));
    if (removedVariantIds.length > 0) {
      await transaction.productVariant.updateMany({
        where: { id: { in: removedVariantIds }, productId },
        data: { active: false },
      });
    }

    return product;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function adjustProductStock(
  productId: string,
  adjustment: number,
  reason: string,
  adminId: string,
) {
  return prisma.$transaction(async (transaction) => {
    const product = await transaction.product.findUnique({
      where: { id: productId },
      select: { stock: true, variants: { where: { active: true }, select: { id: true }, take: 1 } },
    });
    if (!product) throw new AdminProductRequestError('Product not found.', 404);
    if (product.variants.length > 0) {
      throw new AdminProductRequestError('Adjust stock on the individual product variants.', 409);
    }

    const nextStock = product.stock + adjustment;
    if (nextStock < 0) {
      throw new AdminProductRequestError('The adjustment cannot reduce available stock below zero.', 409);
    }
    if (nextStock > MAX_STOCK) {
      throw new AdminProductRequestError('The adjustment exceeds the supported stock limit.', 400);
    }

    const updated = await transaction.product.updateMany({
      where: { id: productId, stock: product.stock },
      data: { stock: nextStock },
    });
    if (updated.count !== 1) {
      throw new AdminProductRequestError('Stock changed at the same time. Reload and try again.', 409);
    }

    await transaction.auditLog.create({
      data: {
        actorId: adminId,
        action: 'product.stock.adjusted',
        entityType: 'Product',
        entityId: productId,
        details: { previousStock: product.stock, adjustment, newStock: nextStock, reason },
      },
    });

    return { stock: nextStock };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function adjustVariantStock(
  variantId: string,
  adjustment: number,
  reason: string,
  adminId: string,
) {
  return prisma.$transaction(async (transaction) => {
    const variant = await transaction.productVariant.findUnique({
      where: { id: variantId },
      select: { stock: true },
    });
    if (!variant) throw new AdminProductRequestError('Product variant not found.', 404);

    const nextStock = variant.stock + adjustment;
    if (nextStock < 0) {
      throw new AdminProductRequestError('The adjustment cannot reduce available stock below zero.', 409);
    }
    if (nextStock > MAX_STOCK) {
      throw new AdminProductRequestError('The adjustment exceeds the supported stock limit.', 400);
    }

    const updated = await transaction.productVariant.updateMany({
      where: { id: variantId, stock: variant.stock },
      data: { stock: nextStock },
    });
    if (updated.count !== 1) {
      throw new AdminProductRequestError('Stock changed at the same time. Reload and try again.', 409);
    }

    await transaction.auditLog.create({
      data: {
        actorId: adminId,
        action: 'product.variant.stock.adjusted',
        entityType: 'ProductVariant',
        entityId: variantId,
        details: { previousStock: variant.stock, adjustment, newStock: nextStock, reason },
      },
    });

    return { stock: nextStock };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
