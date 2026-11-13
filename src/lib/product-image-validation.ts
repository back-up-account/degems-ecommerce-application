export const MAX_PRODUCT_IMAGE_BYTES = 8 * 1024 * 1024;

export type ProductImageContentType = 'image/avif' | 'image/jpeg' | 'image/png' | 'image/webp';

export class ProductImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductImageValidationError';
  }
}

function readAscii(bytes: Uint8Array, start: number, end: number) {
  return String.fromCharCode(...bytes.slice(start, end));
}

function hasExpectedSignature(contentType: ProductImageContentType, header: Uint8Array) {
  if (contentType === 'image/jpeg') {
    return header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  }

  if (contentType === 'image/png') {
    return header.length >= 8
      && header[0] === 0x89
      && readAscii(header, 1, 4) === 'PNG'
      && header[4] === 0x0d
      && header[5] === 0x0a
      && header[6] === 0x1a
      && header[7] === 0x0a;
  }

  if (contentType === 'image/webp') {
    return header.length >= 12 && readAscii(header, 0, 4) === 'RIFF' && readAscii(header, 8, 12) === 'WEBP';
  }

  if (header.length < 12 || readAscii(header, 4, 8) !== 'ftyp') return false;
  const brands = [readAscii(header, 8, 12)];
  for (let offset = 16; offset + 4 <= header.length; offset += 4) {
    brands.push(readAscii(header, offset, offset + 4));
  }
  return brands.some((brand) => brand === 'avif' || brand === 'avis');
}

export function validateProductImageFile(
  file: { size: number; type: string },
  header: Uint8Array,
): ProductImageContentType {
  if (file.size < 1) {
    throw new ProductImageValidationError('Choose an image file that is not empty.');
  }
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) {
    throw new ProductImageValidationError('Image files must be 8 MB or smaller.');
  }

  const contentType = file.type;
  if (
    contentType !== 'image/avif'
    && contentType !== 'image/jpeg'
    && contentType !== 'image/png'
    && contentType !== 'image/webp'
  ) {
    throw new ProductImageValidationError('Choose a JPEG, PNG, WebP, or AVIF image.');
  }
  if (!hasExpectedSignature(contentType, header)) {
    throw new ProductImageValidationError('The selected file does not match its image format.');
  }

  return contentType;
}
