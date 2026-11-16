import { describe, expect, it } from 'vitest';
import { ProductImageValidationError, validateProductImageFile } from '@api/lib/product-image-validation';

describe('product image upload validation', () => {
  it.each([
    ['image/jpeg', [0xff, 0xd8, 0xff, 0xe0]],
    ['image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ['image/webp', [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
    ['image/avif', [0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]],
  ] as const)('accepts a supported %s file signature', (type, header) => {
    expect(validateProductImageFile({ size: 1024, type }, new Uint8Array(header))).toBe(type);
  });

  it('rejects unsupported, mismatched, empty, and oversized files', () => {
    expect(() => validateProductImageFile(
      { size: 100, type: 'image/svg+xml' },
      new Uint8Array([0x3c, 0x73, 0x76, 0x67]),
    )).toThrow(ProductImageValidationError);
    expect(() => validateProductImageFile(
      { size: 100, type: 'image/png' },
      new Uint8Array([0xff, 0xd8, 0xff]),
    )).toThrow(/does not match/);
    expect(() => validateProductImageFile({ size: 0, type: 'image/jpeg' }, new Uint8Array()))
      .toThrow(/not empty/);
    expect(() => validateProductImageFile(
      { size: 8 * 1024 * 1024 + 1, type: 'image/jpeg' },
      new Uint8Array([0xff, 0xd8, 0xff]),
    )).toThrow(/8 MB or smaller/);
  });
});
