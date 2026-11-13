import { NextResponse } from 'next/server';
import { authorizeAdminPermission } from '@/lib/admin-api-auth';
import {
  CloudinaryNotConfiguredError,
  CloudinaryProductImageUploadError,
  uploadProductImage,
} from '@/lib/cloudinary-product-images';
import { instrumentHttpHandler } from '@/lib/http-metrics';
import {
  MAX_PRODUCT_IMAGE_BYTES,
  ProductImageValidationError,
  validateProductImageFile,
} from '@/lib/product-image-validation';

export const runtime = 'nodejs';

const MAX_MULTIPART_OVERHEAD_BYTES = 64 * 1024;

async function postProductImage(request: Request) {
  const authorization = await authorizeAdminPermission('catalog.manage');
  if ('response' in authorization) return authorization.response;

  const origin = request.headers.get('origin');
  const allowedOrigin = process.env.NEXTAUTH_URL
    ? new URL(process.env.NEXTAUTH_URL).origin
    : new URL(request.url).origin;
  if (origin && origin !== allowedOrigin) {
    return NextResponse.json({ message: 'Image uploads must come from this store.' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('multipart/form-data;')) {
    return NextResponse.json({ message: 'Choose an image file to upload.' }, { status: 415 });
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength !== null) {
    const requestBytes = Number(contentLength);
    if (!Number.isSafeInteger(requestBytes) || requestBytes < 0) {
      return NextResponse.json({ message: 'The upload request has an invalid size.' }, { status: 400 });
    }
    if (requestBytes > MAX_PRODUCT_IMAGE_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
      return NextResponse.json({ message: 'Image files must be 8 MB or smaller.' }, { status: 413 });
    }
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ message: 'The image upload request could not be read.' }, { status: 400 });
  }

  const entries = [...formData.entries()];
  const file = formData.get('file');
  if (entries.length !== 1 || entries[0][0] !== 'file' || !(file instanceof File)) {
    return NextResponse.json({ message: 'Choose one image file to upload.' }, { status: 400 });
  }

  try {
    const header = new Uint8Array(await file.slice(0, 32).arrayBuffer());
    validateProductImageFile(file, header);
    const secureUrl = await uploadProductImage(file);
    return NextResponse.json({ secureUrl });
  } catch (error) {
    if (error instanceof ProductImageValidationError) {
      return NextResponse.json({ message: error.message }, { status: 400 });
    }
    if (error instanceof CloudinaryNotConfiguredError) {
      return NextResponse.json({ message: 'Image uploads are not configured yet.' }, { status: 503 });
    }
    if (error instanceof CloudinaryProductImageUploadError) {
      console.error('Cloudinary product image upload failed.', error.cause);
      return NextResponse.json({ message: 'The image service could not process this upload. Try again later.' }, { status: 502 });
    }

    throw error;
  }
}

export const POST = instrumentHttpHandler('/api/admin/products/images', 'POST', postProductImage);
