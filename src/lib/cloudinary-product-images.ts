import 'server-only';
import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiResponse } from 'cloudinary';

export class CloudinaryNotConfiguredError extends Error {
  constructor() {
    super('Cloudinary image uploads are not configured.');
    this.name = 'CloudinaryNotConfiguredError';
  }
}

export class CloudinaryProductImageUploadError extends Error {
  constructor(cause: unknown) {
    super('Cloudinary could not complete the image upload.', { cause });
    this.name = 'CloudinaryProductImageUploadError';
  }
}

export async function uploadProductImage(file: File) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !/^[a-z0-9-]+$/.test(cloudName) || !apiKey || !apiSecret) {
    throw new CloudinaryNotConfiguredError();
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream({
        folder: 'degems/products',
        resource_type: 'image',
        allowed_formats: ['avif', 'jpg', 'png', 'webp'],
        unique_filename: true,
        overwrite: false,
      }, (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary returned no uploaded image.'));
          return;
        }
        resolve(result);
      });
      uploadStream.once('error', reject);
      uploadStream.end(bytes);
    });

    return cloudinary.url(uploaded.public_id, {
      secure: true,
      resource_type: 'image',
      type: 'upload',
      version: uploaded.version,
      transformation: [{ width: 1600, crop: 'limit', quality: 'auto', fetch_format: 'auto' }],
    });
  } catch (error) {
    throw new CloudinaryProductImageUploadError(error);
  }
}
