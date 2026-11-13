import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { productInputSchema } from '@/lib/product-validation';

const validProduct = {
  name: 'Test listing',
  sku: `TEST-${randomUUID()}`,
  categorySlug: 'kitchen-dining',
  shortDescription: 'A practical product description.',
  description: 'A longer practical product description for validation.',
  price: 250,
  stock: 5,
  image: 'https://images.example.test/main.jpg',
  gallery: 'https://images.example.test/side.jpg\nhttps://images.example.test/detail.jpg',
};

describe('product gallery validation', () => {
  it('parses newline-delimited HTTPS gallery URLs', () => {
    expect(productInputSchema.parse(validProduct).gallery).toEqual([
      'https://images.example.test/side.jpg',
      'https://images.example.test/detail.jpg',
    ]);
  });

  it('rejects insecure and excessive gallery URLs', () => {
    expect(productInputSchema.safeParse({ ...validProduct, gallery: 'http://example.test/insecure.jpg' }).success)
      .toBe(false);
    expect(productInputSchema.safeParse({
      ...validProduct,
      gallery: Array.from({ length: 9 }, (_, index) => `https://images.example.test/${index}.jpg`),
    }).success).toBe(false);
  });
});

describe('product variant validation', () => {
  it('normalizes variant SKUs and converts price overrides to kobo', () => {
    const parsed = productInputSchema.parse({
      ...validProduct,
      variants: [{ name: 'Blue / Large', sku: 'blue-large', price: 325, stock: 4 }],
    });

    expect(parsed.variants).toEqual([{
      name: 'Blue / Large',
      sku: 'BLUE-LARGE',
      price: 32_500,
      stock: 4,
      active: true,
    }]);
  });

  it('rejects duplicate variant names and SKUs', () => {
    const variants = [
      { name: 'Blue', sku: 'BLUE-1', stock: 2 },
      { name: 'blue', sku: 'BLUE-1', stock: 3 },
    ];

    expect(productInputSchema.safeParse({ ...validProduct, variants }).success).toBe(false);
    expect(productInputSchema.safeParse({
      ...validProduct,
      variants: [{ name: 'Blue', sku: validProduct.sku, stock: 2 }],
    }).success).toBe(false);
  });
});
