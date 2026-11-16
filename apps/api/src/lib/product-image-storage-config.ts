type Environment = Record<string, string | undefined>;

export type ProductImageStorageConfig = {
  bucket: string;
  region: string;
  imageKitUrlEndpoint: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
};

const REQUIRED_SETTINGS = [
  'PRODUCT_IMAGE_S3_BUCKET',
  'PRODUCT_IMAGE_S3_REGION',
  'IMAGEKIT_URL_ENDPOINT',
] as const;

const OPTIONAL_SETTINGS = [
  'PRODUCT_IMAGE_S3_ENDPOINT',
  'PRODUCT_IMAGE_S3_ACCESS_KEY_ID',
  'PRODUCT_IMAGE_S3_SECRET_ACCESS_KEY',
  'PRODUCT_IMAGE_S3_FORCE_PATH_STYLE',
] as const;

export class ProductImageStorageConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProductImageStorageConfigurationError';
  }
}

export function readProductImageStorageConfig(
  env: Environment = process.env,
): ProductImageStorageConfig | undefined {
  const allSettings = [...REQUIRED_SETTINGS, ...OPTIONAL_SETTINGS];
  const hasConfiguredSetting = allSettings.some((name) => {
    const value = env[name]?.trim();
    return Boolean(value)
      && !(name === 'PRODUCT_IMAGE_S3_FORCE_PATH_STYLE' && value?.toLowerCase() === 'false');
  });
  if (!hasConfiguredSetting) return undefined;

  const missingSettings = REQUIRED_SETTINGS.filter((name) => !env[name]?.trim());
  if (missingSettings.length > 0) {
    throw new ProductImageStorageConfigurationError(
      `${REQUIRED_SETTINGS.join(', ')} must be configured together.`,
    );
  }

  const bucket = env.PRODUCT_IMAGE_S3_BUCKET!.trim();
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes('..')) {
    throw new ProductImageStorageConfigurationError('PRODUCT_IMAGE_S3_BUCKET must be a valid S3 bucket name.');
  }

  const region = env.PRODUCT_IMAGE_S3_REGION!.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(region)) {
    throw new ProductImageStorageConfigurationError('PRODUCT_IMAGE_S3_REGION must be a valid region identifier.');
  }

  const accessKeyId = env.PRODUCT_IMAGE_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.PRODUCT_IMAGE_S3_SECRET_ACCESS_KEY?.trim();
  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new ProductImageStorageConfigurationError(
      'PRODUCT_IMAGE_S3_ACCESS_KEY_ID and PRODUCT_IMAGE_S3_SECRET_ACCESS_KEY must be configured together.',
    );
  }

  const forcePathStyleValue = env.PRODUCT_IMAGE_S3_FORCE_PATH_STYLE?.trim().toLowerCase();
  if (forcePathStyleValue && forcePathStyleValue !== 'true' && forcePathStyleValue !== 'false') {
    throw new ProductImageStorageConfigurationError(
      'PRODUCT_IMAGE_S3_FORCE_PATH_STYLE must be either "true" or "false".',
    );
  }

  const imageKitUrlEndpoint = parseUrl(
    env.IMAGEKIT_URL_ENDPOINT!,
    'IMAGEKIT_URL_ENDPOINT',
    true,
  ).toString().replace(/\/+$/, '');
  const endpointValue = env.PRODUCT_IMAGE_S3_ENDPOINT?.trim();
  const endpoint = endpointValue
    ? parseUrl(endpointValue, 'PRODUCT_IMAGE_S3_ENDPOINT', env.NODE_ENV === 'production').toString().replace(/\/+$/, '')
    : undefined;

  return {
    bucket,
    region,
    imageKitUrlEndpoint,
    ...(endpoint ? { endpoint } : {}),
    ...(accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : {}),
    forcePathStyle: forcePathStyleValue === 'true',
  };
}

export function createImageKitDeliveryUrl(imageKitUrlEndpoint: string, objectKey: string) {
  if (!/^products\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(avif|jpg|png|webp)$/.test(objectKey)) {
    throw new TypeError('Product image object key is invalid.');
  }

  const endpoint = new URL(imageKitUrlEndpoint);
  const basePath = endpoint.pathname.replace(/\/+$/, '');
  const encodedKey = objectKey.split('/').map(encodeURIComponent).join('/');
  const deliveryUrl = new URL(`${basePath}/${encodedKey}`, endpoint.origin);
  deliveryUrl.searchParams.set('tr', 'w-1600,q-auto,f-auto');
  return deliveryUrl.toString();
}

function parseUrl(value: string, name: string, requireHttps: boolean) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ProductImageStorageConfigurationError(`${name} must be a valid URL.`);
  }

  if (
    !['http:', 'https:'].includes(url.protocol)
    || !url.hostname
    || url.username
    || url.password
    || url.search
    || url.hash
    || (requireHttps && url.protocol !== 'https:')
  ) {
    const protocolRequirement = requireHttps ? 'HTTPS' : 'HTTP or HTTPS';
    throw new ProductImageStorageConfigurationError(
      `${name} must be a URL using ${protocolRequirement} without credentials, query parameters, or a fragment.`,
    );
  }
  return url;
}
