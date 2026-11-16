import { describe, expect, it } from 'vitest';
import {
  createImageKitDeliveryUrl,
  ProductImageStorageConfigurationError,
  readProductImageStorageConfig,
} from '@api/lib/product-image-storage-config';

const configuredStorage = {
  PRODUCT_IMAGE_S3_BUCKET: 'degems-product-images',
  PRODUCT_IMAGE_S3_REGION: 'eu-west-1',
  IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/degems',
};

describe('product image storage configuration', () => {
  it('leaves image uploads optional when storage settings are omitted', () => {
    expect(readProductImageStorageConfig({
      PRODUCT_IMAGE_S3_FORCE_PATH_STYLE: 'false',
    })).toBeUndefined();
  });

  it('parses a complete S3 and ImageKit configuration', () => {
    expect(readProductImageStorageConfig({
      ...configuredStorage,
      PRODUCT_IMAGE_S3_ENDPOINT: 'https://s3.example.test',
      PRODUCT_IMAGE_S3_ACCESS_KEY_ID: 'access-key',
      PRODUCT_IMAGE_S3_SECRET_ACCESS_KEY: 'secret-key',
      PRODUCT_IMAGE_S3_FORCE_PATH_STYLE: 'true',
      NODE_ENV: 'production',
    })).toEqual({
      bucket: 'degems-product-images',
      region: 'eu-west-1',
      imageKitUrlEndpoint: 'https://ik.imagekit.io/degems',
      endpoint: 'https://s3.example.test',
      accessKeyId: 'access-key',
      secretAccessKey: 'secret-key',
      forcePathStyle: true,
    });
  });

  it('rejects partial storage settings and mismatched explicit credentials', () => {
    expect(() => readProductImageStorageConfig({
      PRODUCT_IMAGE_S3_BUCKET: configuredStorage.PRODUCT_IMAGE_S3_BUCKET,
    })).toThrow(ProductImageStorageConfigurationError);

    expect(() => readProductImageStorageConfig({
      ...configuredStorage,
      PRODUCT_IMAGE_S3_ACCESS_KEY_ID: 'access-key',
    })).toThrow('PRODUCT_IMAGE_S3_ACCESS_KEY_ID and PRODUCT_IMAGE_S3_SECRET_ACCESS_KEY must be configured together.');
  });

  it('requires HTTPS for a custom S3 endpoint in production', () => {
    expect(() => readProductImageStorageConfig({
      ...configuredStorage,
      PRODUCT_IMAGE_S3_ENDPOINT: 'http://s3.example.test',
      NODE_ENV: 'production',
    })).toThrow('PRODUCT_IMAGE_S3_ENDPOINT must be a URL using HTTPS');
  });

  it('builds ImageKit delivery URLs and rejects keys outside the generated product-image format', () => {
    const url = new URL(createImageKitDeliveryUrl(
      'https://ik.imagekit.io/degems/',
      'products/123e4567-e89b-12d3-a456-426614174000.webp',
    ));

    expect(url.origin).toBe('https://ik.imagekit.io');
    expect(url.pathname).toBe('/degems/products/123e4567-e89b-12d3-a456-426614174000.webp');
    expect(url.searchParams.get('tr')).toBe('w-1600,q-auto,f-auto');
    expect(() => createImageKitDeliveryUrl(
      'https://ik.imagekit.io/degems',
      '../private/image.webp',
    )).toThrow('Product image object key is invalid.');
  });
});
