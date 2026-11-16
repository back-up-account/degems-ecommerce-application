import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductImageUploadError, uploadProductImage } from '@api/lib/s3-product-images';

const { clientConfig, putObjectInput, sendMock } = vi.hoisted(() => ({
  clientConfig: vi.fn(),
  putObjectInput: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('node:crypto', () => ({
  randomUUID: () => '123e4567-e89b-12d3-a456-426614174000',
}));
vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: class {
    constructor(input: unknown) {
      putObjectInput(input);
    }
  },
  S3Client: class {
    constructor(config: unknown) {
      clientConfig(config);
    }

    send = sendMock;
  },
}));

describe('S3 product image uploads', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('stores the validated image in S3 and returns its ImageKit delivery URL', async () => {
    vi.stubEnv('PRODUCT_IMAGE_S3_BUCKET', 'degems-product-images');
    vi.stubEnv('PRODUCT_IMAGE_S3_REGION', 'eu-west-1');
    vi.stubEnv('PRODUCT_IMAGE_S3_ENDPOINT', 'https://s3.example.test');
    vi.stubEnv('PRODUCT_IMAGE_S3_ACCESS_KEY_ID', 'access-key');
    vi.stubEnv('PRODUCT_IMAGE_S3_SECRET_ACCESS_KEY', 'secret-key');
    vi.stubEnv('PRODUCT_IMAGE_S3_FORCE_PATH_STYLE', 'true');
    vi.stubEnv('IMAGEKIT_URL_ENDPOINT', 'https://ik.imagekit.io/degems');
    sendMock.mockResolvedValue({});
    const file = new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' });

    const result = await uploadProductImage(file, 'image/png');

    expect(clientConfig).toHaveBeenCalledWith({
      region: 'eu-west-1',
      endpoint: 'https://s3.example.test',
      forcePathStyle: true,
      credentials: { accessKeyId: 'access-key', secretAccessKey: 'secret-key' },
    });
    expect(putObjectInput).toHaveBeenCalledWith({
      Bucket: 'degems-product-images',
      Key: 'products/123e4567-e89b-12d3-a456-426614174000.png',
      Body: Buffer.from([1, 2, 3]),
      ContentType: 'image/png',
      ContentDisposition: 'inline',
      CacheControl: 'public, max-age=31536000, immutable',
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(new URL(result).searchParams.get('tr')).toBe('w-1600,q-auto,f-auto');
  });

  it('exposes an explicit upload error when S3 rejects the write', async () => {
    vi.stubEnv('PRODUCT_IMAGE_S3_BUCKET', 'degems-product-images');
    vi.stubEnv('PRODUCT_IMAGE_S3_REGION', 'eu-west-1');
    vi.stubEnv('IMAGEKIT_URL_ENDPOINT', 'https://ik.imagekit.io/degems');
    const providerError = new Error('provider failure');
    sendMock.mockRejectedValue(providerError);
    const file = new File([new Uint8Array([1])], 'photo.png', { type: 'image/png' });

    await expect(uploadProductImage(file, 'image/png')).rejects.toMatchObject({
      name: ProductImageUploadError.name,
      cause: providerError,
    });
  });
});
