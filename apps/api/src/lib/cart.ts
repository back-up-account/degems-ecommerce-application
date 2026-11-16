import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authConfig } from '@api/lib/auth';
import { prisma } from '@api/lib/prisma';

const CART_COOKIE = 'degems_cart';
const CART_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CartView = {
  items: Array<{
    id: string;
    productId: string;
    variantId: string | null;
    variantName: string | null;
    slug: string;
    name: string;
    image: string;
    price: number;
    stock: number;
    quantity: number;
    available: boolean;
  }>;
  itemCount: number;
  subtotal: number;
};

export class CartNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not configured.');
    this.name = 'CartNotConfiguredError';
  }
}

function hashGuestToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function ensureDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new CartNotConfiguredError();
  }
}

async function getValidGuestToken() {
  ensureDatabase();
  const cookieStore = await cookies();
  const token = cookieStore.get(CART_COOKIE)?.value;
  return token && uuidPattern.test(token) ? token : null;
}

export async function getCurrentCartId() {
  ensureDatabase();
  const userId = await getCurrentUserId();
  if (userId) return claimGuestCartForUser(userId);

  const token = await getValidGuestToken();
  if (!token) return null;

  const cart = await prisma.cart.findFirst({
    where: { guestToken: hashGuestToken(token), userId: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  return cart?.id ?? null;
}

export async function readCurrentCart(): Promise<CartView> {
  ensureDatabase();
  const cartId = await getCurrentCartId();
  if (!cartId) return { items: [], itemCount: 0, subtotal: 0 };

  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          product: { include: { variants: { where: { active: true }, select: { id: true } } } },
          variant: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return cart ? toCartView(cart) : { items: [], itemCount: 0, subtotal: 0 };
}

export async function getOrCreateCurrentCart() {
  ensureDatabase();
  const userId = await getCurrentUserId();
  if (userId) {
    const claimedCartId = await claimGuestCartForUser(userId);
    if (claimedCartId) return claimedCartId;
    const cart = await prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });
    return cart.id;
  }

  const cookieStore = await cookies();
  const existingToken = cookieStore.get(CART_COOKIE)?.value;
  const validToken = existingToken && uuidPattern.test(existingToken) ? existingToken : null;
  const now = new Date();

  if (validToken) {
    const tokenHash = hashGuestToken(validToken);
    const existingCart = await prisma.cart.findUnique({
      where: { guestToken: tokenHash },
      select: { id: true, expiresAt: true, userId: true },
    });

    if (existingCart?.userId === null && existingCart.expiresAt && existingCart.expiresAt > now) {
      return existingCart.id;
    }

    if (existingCart?.userId === null) {
      await prisma.cart.delete({ where: { id: existingCart.id } });
    }
  }

  const token = randomUUID();
  const cart = await prisma.cart.create({
    data: {
      guestToken: hashGuestToken(token),
      expiresAt: new Date(now.getTime() + CART_LIFETIME_MS),
    },
    select: { id: true },
  });

  cookieStore.set(CART_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: CART_LIFETIME_MS / 1000,
  });

  return cart.id;
}

export async function mergeGuestCartIntoAccount(userId: string, guestCartId: string) {
  return prisma.$transaction(async (transaction) => {
    const guestCart = await transaction.cart.findUnique({
      where: { id: guestCartId },
      select: { id: true, userId: true, expiresAt: true },
    });
    const accountCart = await transaction.cart.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!guestCart) return accountCart?.id ?? null;
    if (guestCart.userId === userId) {
      await transaction.cart.update({
        where: { id: guestCart.id },
        data: { guestToken: null, expiresAt: null },
      });
      return guestCart.id;
    }
    if (guestCart.userId || !guestCart.expiresAt || guestCart.expiresAt <= new Date()) {
      return accountCart?.id ?? null;
    }

    if (!accountCart) {
      const claimed = await transaction.cart.updateMany({
        where: { id: guestCart.id, userId: null, expiresAt: { gt: new Date() } },
        data: { userId, guestToken: null, expiresAt: null },
      });
      if (claimed.count === 1) return guestCart.id;
      return (await transaction.cart.findUnique({ where: { userId }, select: { id: true } }))?.id ?? null;
    }

    const guestItems = await transaction.cartItem.findMany({
      where: { cartId: guestCart.id },
      select: { id: true, lineKey: true, quantity: true },
    });
    for (const guestItem of guestItems) {
      const accountItem = await transaction.cartItem.findUnique({
        where: { cartId_lineKey: { cartId: accountCart.id, lineKey: guestItem.lineKey } },
        select: { id: true },
      });
      if (accountItem) {
        await transaction.cartItem.update({
          where: { id: accountItem.id },
          data: { quantity: { increment: guestItem.quantity } },
        });
      } else {
        await transaction.cartItem.update({
          where: { id: guestItem.id },
          data: { cartId: accountCart.id },
        });
      }
    }
    await transaction.cart.delete({ where: { id: guestCart.id } });
    return accountCart.id;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export function toCartView(cart: {
  items: Array<{
    id: string;
    productId: string;
    variantId: string | null;
    quantity: number;
    product: {
      slug: string;
      name: string;
      image: string;
      price: number;
      stock: number;
      published: boolean;
      variants: Array<{ id: string }>;
    };
    variant: {
      id: string;
      productId: string;
      name: string;
      price: number | null;
      stock: number;
      active: boolean;
    } | null;
  }>;
}): CartView {
  const items = cart.items.map((item) => {
    const hasVariants = item.product.variants.length > 0;
    const selectedVariant = item.variant?.productId === item.productId ? item.variant : null;
    const variantIsValid = hasVariants
      ? Boolean(selectedVariant?.active)
      : item.variantId === null;
    const price = selectedVariant?.price ?? item.product.price;
    const stock = selectedVariant ? selectedVariant.stock : item.product.stock;

    return {
      id: item.id,
      productId: item.productId,
      variantId: selectedVariant?.id ?? null,
      variantName: selectedVariant?.name ?? null,
      slug: item.product.slug,
      name: item.product.name,
      image: item.product.image,
      price,
      stock,
      quantity: item.quantity,
      available: item.product.published && variantIsValid && stock >= item.quantity,
    };
  });

  return {
    items,
    itemCount: items.reduce((total, item) => total + item.quantity, 0),
    subtotal: items.reduce((total, item) => total + item.price * item.quantity, 0),
  };
}

async function claimGuestCartForUser(userId: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(CART_COOKIE)?.value;
  const validToken = token && uuidPattern.test(token) ? token : null;
  const accountCart = await prisma.cart.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!validToken) return accountCart?.id ?? null;

  const guestCart = await prisma.cart.findUnique({
    where: { guestToken: hashGuestToken(validToken) },
    select: { id: true, expiresAt: true },
  });
  if (!guestCart) {
    cookieStore.delete(CART_COOKIE);
    return accountCart?.id ?? null;
  }
  if (!guestCart.expiresAt || guestCart.expiresAt <= new Date()) {
    await prisma.cart.delete({ where: { id: guestCart.id } });
    cookieStore.delete(CART_COOKIE);
    return accountCart?.id ?? null;
  }

  const cartId = await mergeGuestCartIntoAccount(userId, guestCart.id);
  cookieStore.delete(CART_COOKIE);
  return cartId;
}

async function getCurrentUserId() {
  const session = await getServerSession(authConfig);
  return session?.user.id || null;
}
