import { Prisma } from '@prisma/client';
import { prisma } from '@api/lib/prisma';
import { isHttpsUrl } from '@api/lib/url-validation';

export type StoreProduct = {
  id: string;
  slug: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  image: string;
  gallery: string[];
  badge?: string;
  featured: boolean;
  description: string;
  inStock: boolean;
  features: string[];
  variants: Array<{ id: string; name: string; price: number; stock: number }>;
};

const productWithCategory = Prisma.validator<Prisma.ProductDefaultArgs>()({
  include: {
    category: true,
    variants: { where: { active: true }, orderBy: { name: 'asc' } },
  },
});

type ProductWithCategory = Prisma.ProductGetPayload<typeof productWithCategory>;

export class CatalogNotConfiguredError extends Error {
  constructor() {
    super('DATABASE_URL is not configured.');
    this.name = 'CatalogNotConfiguredError';
  }
}

function requireDatabaseConfiguration() {
  if (!process.env.DATABASE_URL) {
    throw new CatalogNotConfiguredError();
  }
}

function toStoreProduct(product: ProductWithCategory): StoreProduct {
  const gallery = Array.isArray(product.gallery)
    ? [...new Set(product.gallery.filter((image): image is string => (
      typeof image === 'string'
      && image !== product.image
      && isHttpsUrl(image)
    )))]
    : [];

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category.name,
    price: product.variants.length
      ? Math.min(...product.variants.map((variant) => variant.price ?? product.price))
      : product.price,
    stock: product.stock,
    image: product.image,
    gallery,
    badge: product.featured ? 'Featured' : undefined,
    featured: product.featured,
    description: product.shortDescription,
    inStock: product.variants.length
      ? product.variants.some((variant) => variant.stock > 0)
      : product.stock > 0,
    features: product.subcategory ? [product.subcategory] : [],
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      price: variant.price ?? product.price,
      stock: variant.stock,
    })),
  };
}

export async function listPublishedProducts(options: {
  category?: string;
  search?: string;
  featuredOnly?: boolean;
} = {}) {
  requireDatabaseConfiguration();
  const search = options.search?.trim();
  const products = await prisma.product.findMany({
    where: {
      published: true,
      ...(options.featuredOnly ? { featured: true } : {}),
      ...(options.category ? { category: { slug: options.category } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { shortDescription: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: productWithCategory.include,
    orderBy: [{ featured: 'desc' }, { createdAt: 'desc' }],
  });

  return products.map(toStoreProduct);
}

export async function getPublishedProductBySlug(slug: string) {
  requireDatabaseConfiguration();
  const product = await prisma.product.findFirst({
    where: { slug, published: true },
    ...productWithCategory,
  });

  return product ? toStoreProduct(product) : null;
}

export async function listAdminProducts() {
  requireDatabaseConfiguration();
  return prisma.product.findMany({
    include: { category: true, variants: { orderBy: { name: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
}
