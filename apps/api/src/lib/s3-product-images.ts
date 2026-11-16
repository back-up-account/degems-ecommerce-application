import 'server-only';
import { randomUUID } from 'node:crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ProductImageContentType } from '@api/lib/product-image-validation';
import {
  createImageKitDeliveryUrl,
  ProductImageStorageConfigurationError,
  readProductImageStorageConfig,
} from '@api/lib/product-image-storage-config';

const fileExtensions: Record<ProductImageContentType, string> = {
  'image/avif': 'avif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

let s3Client: S3Client | undefined;

export class ProductImageUploadError extends Error {
  constructor(cause: unknown) {
    super('S3 could not complete the product image upload.', { cause });
    this.name = 'ProductImageUploadError';
  }
}

export async function uploadProductImage(file: File, contentType: ProductImageContentType) {
  const config = readProductImageStorageConfig();
  if (!config) {
    throw new ProductImageStorageConfigurationError(
      'Configure S3 storage and the ImageKit URL endpoint before uploading images.',
    );
  }

  const key = `products/${randomUUID()}.${fileExtensions[contentType]}`;
  try {
    const body = Buffer.from(await file.arrayBuffer());
    s3Client ??= new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint } : {}),
      forcePathStyle: config.forcePathStyle,
      ...(config.accessKeyId && config.secretAccessKey
        ? { credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }
        : {}),
    });

    await s3Client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentDisposition: 'inline',
      CacheControl: 'public, max-age=31536000, immutable',
    }));
  } catch (error) {
    throw new ProductImageUploadError(error);
  }

  return createImageKitDeliveryUrl(config.imageKitUrlEndpoint, key);
}
