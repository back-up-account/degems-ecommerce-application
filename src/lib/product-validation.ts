import { z } from 'zod';
import { departments } from '@/lib/departments';
import { isHttpsUrl } from '@/lib/url-validation';

const MAX_DATABASE_INTEGER = 2_147_483_647;
const MAX_PRICE_NAIRA = Math.floor(MAX_DATABASE_INTEGER / 100);
const nairaToKobo = z.coerce.number().int().positive().max(MAX_PRICE_NAIRA).transform((value) => value * 100);
const httpsImageUrl = z.string().trim().url().max(2048).refine(isHttpsUrl, {
  message: 'Product image URL must use HTTPS.',
});
const galleryImages = z.preprocess(
  (value) => {
    if (typeof value === 'string') return value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    return value ?? [];
  },
  z.array(httpsImageUrl).max(8, 'A product gallery can contain at most eight additional images.'),
);

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  sku: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9._-]+$/).transform((value) => value.toUpperCase()),
  price: z.preprocess(
    (value) => value === '' || value === undefined || (typeof value === 'number' && Number.isNaN(value))
      ? undefined
      : Number(value),
    nairaToKobo.optional(),
  ),
  stock: z.coerce.number().int().nonnegative().max(1_000_000),
  active: z.boolean().default(true),
});

const productDetailsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  sku: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9._-]+$/).transform((value) => value.toUpperCase()),
  categorySlug: z.string().refine(
    (value) => departments.some((department) => department.slug === value),
    'Choose a supported DEGEMS department.',
  ),
  subcategory: z.string().trim().max(80).optional().default(''),
  shortDescription: z.string().trim().min(10).max(240),
  description: z.string().trim().min(20).max(5000),
  price: nairaToKobo,
  compareAtPrice: z.preprocess(
    (value) => value === '' || value === undefined || (typeof value === 'number' && Number.isNaN(value))
      ? undefined
      : Number(value),
    nairaToKobo.optional(),
  ),
  stock: z.coerce.number().int().nonnegative().max(1_000_000),
  image: httpsImageUrl,
  gallery: galleryImages,
  variants: z.array(variantSchema).max(100).default([]),
  featured: z.boolean().default(false),
  published: z.boolean().default(false),
});

const compareAtPriceRule = {
  path: ['compareAtPrice'],
  message: 'Compare-at price must be greater than the selling price.',
};

const hasValidCompareAtPrice = (
  product: { price: number; compareAtPrice?: number },
) => product.compareAtPrice === undefined || product.compareAtPrice > product.price;

function hasUniqueVariants(product: {
  sku: string;
  variants: Array<{ id?: string; name: string; sku: string; active: boolean }>;
}) {
  const skus = [product.sku, ...product.variants.map((variant) => variant.sku)];
  const ids = product.variants.flatMap((variant) => variant.id ? [variant.id] : []);
  const names = product.variants.filter((variant) => variant.active !== false).map((variant) => variant.name.toLowerCase());
  return new Set(skus).size === skus.length
    && new Set(ids).size === ids.length
    && new Set(names).size === names.length;
}

export const productUpdateSchema = productDetailsSchema.strict().refine(
  hasValidCompareAtPrice,
  compareAtPriceRule,
).refine(hasUniqueVariants, {
  path: ['variants'],
  message: 'Variant SKUs and active names must be unique, and cannot match the product SKU.',
});

export const productInputSchema = productDetailsSchema.extend({
  stock: z.coerce.number().int().nonnegative().max(1_000_000),
}).refine(
  hasValidCompareAtPrice,
  compareAtPriceRule,
).refine(hasUniqueVariants, {
  path: ['variants'],
  message: 'Variant SKUs and active names must be unique, and cannot match the product SKU.',
});

export type ProductInput = z.infer<typeof productInputSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
