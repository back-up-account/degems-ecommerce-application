import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentCartId, getOrCreateCurrentCart, readCurrentCart } from '@/lib/cart';
import { instrumentHttpHandler } from '@/lib/http-metrics';
import { prisma } from '@/lib/prisma';

const addItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  quantity: z.number().int().min(1).max(99).default(1),
});

const updateItemSchema = z.object({
  cartItemId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
});

const removeItemSchema = z.object({
  cartItemId: z.string().uuid(),
});

async function getCart() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Product database is not configured.' }, { status: 503 });
  }

  return NextResponse.json(await readCurrentCart());
}

async function postCart(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Product database is not configured.' }, { status: 503 });
  }

  const parsed = await parseBody(request, addItemSchema);
  if (parsed instanceof NextResponse) return parsed;

  const cartId = await getOrCreateCurrentCart();
  try {
    await prisma.$transaction(async (transaction) => {
      const product = await transaction.product.findFirst({
        where: { id: parsed.productId, published: true },
        select: {
          id: true,
          stock: true,
          variants: {
            where: { active: true },
            select: { id: true, stock: true },
          },
        },
      });

      if (!product) {
        throw new CartRequestError('This product is no longer available.', 404);
      }

      const hasVariants = product.variants.length > 0;
      const variant = parsed.variantId
        ? product.variants.find((candidate) => candidate.id === parsed.variantId)
        : null;
      if ((hasVariants && !variant) || (parsed.variantId && !variant)) {
        throw new CartRequestError('Choose an available option for this product.', 409);
      }

      const stock = variant?.stock ?? product.stock;
      const lineKey = variant ? `variant:${variant.id}` : `product:${product.id}`;
      const itemKey = { cartId_lineKey: { cartId, lineKey } };
      const current = await transaction.cartItem.findUnique({ where: itemKey, select: { quantity: true } });
      const quantity = (current?.quantity ?? 0) + parsed.quantity;

      if (quantity > stock) {
        throw new CartRequestError('Requested quantity exceeds available stock.', 409);
      }

      if (current) {
        await transaction.cartItem.update({ where: itemKey, data: { quantity } });
      } else {
        await transaction.cartItem.create({
          data: {
            cartId,
            productId: product.id,
            variantId: variant?.id,
            lineKey,
            quantity,
          },
        });
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof CartRequestError) {
      return NextResponse.json({ message: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002')) {
      return NextResponse.json({ message: 'Cart changed at the same time. Please retry.' }, { status: 409 });
    }
    throw error;
  }

  return NextResponse.json(await readCurrentCart(), { status: 200 });
}

async function patchCart(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Product database is not configured.' }, { status: 503 });
  }

  const parsed = await parseBody(request, updateItemSchema);
  if (parsed instanceof NextResponse) return parsed;

  const cartId = await getCurrentCartId();
  if (!cartId) {
    return NextResponse.json({ message: 'Product is not in this cart.' }, { status: 404 });
  }
  try {
    await prisma.$transaction(async (transaction) => {
      const cartItem = await transaction.cartItem.findFirst({
        where: { id: parsed.cartItemId, cartId },
        include: {
          product: {
            select: {
              id: true,
              stock: true,
              published: true,
              variants: { where: { active: true }, select: { id: true } },
            },
          },
          variant: { select: { id: true, stock: true, active: true, productId: true } },
        },
      });
      if (!cartItem) throw new CartRequestError('This product is not in your cart.', 404);
      const hasVariants = cartItem.product.variants.length > 0;
      const validVariant = cartItem.variant?.productId === cartItem.product.id && cartItem.variant.active
        ? cartItem.variant
        : null;
      const stock = validVariant?.stock ?? cartItem.product.stock;
      if (!cartItem.product.published
        || (hasVariants && !validVariant)
        || (!hasVariants && cartItem.variantId !== null)) {
        throw new CartRequestError('This product option is no longer available.', 409);
      }
      if (parsed.quantity > stock) {
        throw new CartRequestError('Requested quantity exceeds available stock.', 409);
      }

      const updated = await transaction.cartItem.updateMany({
        where: { id: cartItem.id, cartId },
        data: { quantity: parsed.quantity },
      });
      if (updated.count === 0) throw new CartRequestError('Product is not in your cart.', 404);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    const response = getCartErrorResponse(error);
    if (response) return response;
    throw error;
  }

  return NextResponse.json(await readCurrentCart());
}

async function deleteCartItem(request: Request) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ message: 'Product database is not configured.' }, { status: 503 });
  }

  const parsed = await parseBody(request, removeItemSchema);
  if (parsed instanceof NextResponse) return parsed;

  const cartId = await getCurrentCartId();
  if (cartId) {
    await prisma.cartItem.deleteMany({
      where: { cartId, id: parsed.cartItemId },
    });
  }

  return NextResponse.json(await readCurrentCart());
}

export const GET = instrumentHttpHandler('/api/cart', 'GET', getCart);
export const POST = instrumentHttpHandler('/api/cart', 'POST', postCart);
export const PATCH = instrumentHttpHandler('/api/cart', 'PATCH', patchCart);
export const DELETE = instrumentHttpHandler('/api/cart', 'DELETE', deleteCartItem);

async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.output<T> | NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Invalid cart request.', errors: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  return parsed.data;
}

class CartRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function getCartErrorResponse(error: unknown) {
  if (error instanceof CartRequestError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === 'P2034' || error.code === 'P2002')) {
    return NextResponse.json({ message: 'Cart changed at the same time. Please retry.' }, { status: 409 });
  }
  return null;
}
