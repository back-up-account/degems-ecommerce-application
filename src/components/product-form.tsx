'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import type { ReactNode } from 'react';
import type { z } from 'zod';
import { departments } from '@/lib/departments';
import { productInputSchema, type ProductInput } from '@/lib/product-validation';

type ProductFormValues = z.input<typeof productInputSchema>;

export type EditableProduct = {
  id: string;
  name: string;
  sku: string;
  categorySlug: string;
  subcategory: string | null;
  shortDescription: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  image: string;
  gallery: string[];
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    price: number | null;
    stock: number;
    active: boolean;
  }>;
  stock: number;
  featured: boolean;
  published: boolean;
};

export function ProductForm({
  product,
  onCancel,
  canAdjustInventory = true,
}: {
  product?: EditableProduct;
  onCancel?: () => void;
  canAdjustInventory?: boolean;
}) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadingImage, setUploadingImage] = useState<'primary' | 'gallery' | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    control,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<ProductFormValues, unknown, ProductInput>({
    resolver: zodResolver(productInputSchema),
    defaultValues: product ? {
      name: product.name,
      sku: product.sku,
      categorySlug: product.categorySlug,
      subcategory: product.subcategory ?? '',
      shortDescription: product.shortDescription,
      description: product.description,
      price: product.price / 100,
      compareAtPrice: product.compareAtPrice === null ? undefined : product.compareAtPrice / 100,
      image: product.image,
      gallery: product.gallery.join('\n'),
      variants: product.variants.map((variant) => ({
        id: variant.id,
        name: variant.name,
        sku: variant.sku,
        price: variant.price === null ? undefined : variant.price / 100,
        stock: variant.stock,
        active: variant.active,
      })),
      stock: product.stock,
      featured: product.featured,
      published: product.published,
    } : {
      categorySlug: departments[0].slug,
      variants: [],
      featured: false,
      published: false,
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'variants', keyName: 'formKey' });

  async function uploadImage(file: File, target: 'primary' | 'gallery') {
    setUploadStatus('');

    const currentGallery = getValues('gallery');
    const galleryUrls = typeof currentGallery === 'string'
      ? currentGallery.split(/\r?\n/).map((url) => url.trim()).filter(Boolean)
      : Array.isArray(currentGallery)
        ? currentGallery.filter((url): url is string => typeof url === 'string')
        : [];
    if (target === 'gallery' && galleryUrls.length >= 8) {
      setUploadStatus('Remove a gallery image URL before adding another image.');
      return;
    }

    setUploadingImage(target);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch('/api/admin/products/images', { method: 'POST', body: formData });
      const result = await response.json().catch(() => null) as { message?: unknown; secureUrl?: unknown } | null;
      if (!response.ok) {
        setUploadStatus(
          result && typeof result.message === 'string'
            ? result.message
            : 'The image could not be uploaded. Try again.',
        );
        return;
      }
      if (!result || typeof result.secureUrl !== 'string') {
        setUploadStatus('The image service returned an invalid response. Try again.');
        return;
      }

      if (target === 'primary') {
        setValue('image', result.secureUrl, { shouldDirty: true, shouldValidate: true });
      } else {
        setValue('gallery', [...galleryUrls, result.secureUrl].join('\n'), {
          shouldDirty: true,
          shouldValidate: true,
        });
      }
      setUploadStatus('Image uploaded. Save the product to keep this image on the listing.');
    } catch {
      setUploadStatus('Could not reach the image service. Check your connection and try again.');
    } finally {
      setUploadingImage(null);
    }
  }

  async function onSubmit(values: ProductInput) {
    setIsSaving(true);
    setMessage('');

    try {
      const productDetails = {
        name: values.name,
        sku: values.sku,
        categorySlug: values.categorySlug,
        subcategory: values.subcategory,
        shortDescription: values.shortDescription,
        description: values.description,
        price: values.price / 100,
        compareAtPrice: values.compareAtPrice === undefined ? undefined : values.compareAtPrice / 100,
        stock: values.stock,
        image: values.image,
        gallery: values.gallery,
        variants: values.variants.map((variant) => ({
          ...variant,
          price: variant.price === undefined ? undefined : variant.price / 100,
        })),
        featured: values.featured,
        published: values.published,
      };
      const payload = product
        ? { action: 'update', productId: product.id, product: productDetails }
        : { ...productDetails, stock: values.stock };
      const response = await fetch('/api/admin/products', {
        method: product ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { message?: string; product?: { name: string } };

      if (!response.ok) {
        setMessage(result.message ?? 'Product could not be saved.');
        return;
      }

      setMessage(product
        ? `${result.product?.name ?? 'Product'} updated.`
        : `${result.product?.name ?? 'Product'} saved. It will appear in the store when published.`);
      setUploadStatus('');
      if (!product) reset({ categorySlug: departments[0].slug, variants: [], featured: false, published: false });
      router.refresh();
    } catch {
      setMessage('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Product name" error={errors.name?.message}>
          <input {...register('name')} className={inputClass} autoComplete="off" />
        </Field>
        <Field label="SKU" error={errors.sku?.message}>
          <input {...register('sku')} className={inputClass} autoComplete="off" />
        </Field>
        <Field label="Department" error={errors.categorySlug?.message}>
          <select {...register('categorySlug')} className={inputClass}>
            {departments.map((department) => (
              <option key={department.slug} value={department.slug}>{department.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Subcategory" error={errors.subcategory?.message}>
          <input {...register('subcategory')} className={inputClass} placeholder="Optional" />
        </Field>
        <Field label="Price (NGN)" error={errors.price?.message}>
          <input {...register('price', { valueAsNumber: true })} type="number" min="1" step="1" className={inputClass} />
        </Field>
        <Field label="Compare-at price (NGN)" error={errors.compareAtPrice?.message}>
          <input {...register('compareAtPrice', { valueAsNumber: true })} type="number" min="1" step="1" className={inputClass} />
        </Field>
        <Field label="Base stock (for products without active variants)" error={errors.stock?.message}>
          <input
            {...register('stock', { valueAsNumber: true })}
            type="number"
            min="0"
            step="1"
            readOnly={Boolean(product) || !canAdjustInventory}
            className={`${inputClass} read-only:bg-stone-100`}
          />
        </Field>
        <Field label="Product image URL (HTTPS)" error={errors.image?.message}>
          <input {...register('image')} type="url" className={inputClass} placeholder="https://…" />
        </Field>
        <Field label="Upload primary product image">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            disabled={uploadingImage !== null}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void uploadImage(file, 'primary');
              event.currentTarget.value = '';
            }}
            className={`${inputClass} file:mr-3 file:rounded-full file:border-0 file:bg-stone-100 file:px-3 file:py-2`}
          />
        </Field>
      </div>

      <Field label="Short description" error={errors.shortDescription?.message}>
        <input {...register('shortDescription')} maxLength={240} className={inputClass} />
      </Field>
      <Field label="Product description" error={errors.description?.message}>
        <textarea {...register('description')} rows={5} className={inputClass} />
      </Field>
      <Field label="Additional product gallery images (HTTPS, one URL per line)" error={errors.gallery?.message}>
        <textarea {...register('gallery')} rows={4} className={inputClass} placeholder="https://example.com/another-product-image.jpg" />
      </Field>
      <Field label="Upload an additional gallery image">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={uploadingImage !== null}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void uploadImage(file, 'gallery');
            event.currentTarget.value = '';
          }}
          className={`${inputClass} file:mr-3 file:rounded-full file:border-0 file:bg-stone-100 file:px-3 file:py-2`}
        />
      </Field>
      <p role="status" aria-live="polite" className="text-sm text-stone-600">{uploadStatus}</p>
      <p className="text-xs leading-5 text-stone-500">Enter prices in naira; the store records amounts in kobo for accurate payment calculations.</p>
      {product && canAdjustInventory
        ? <p className="text-xs leading-5 text-stone-500">Use the separate stock adjustment control to change available inventory and record a reason.</p>
        : null}

      <fieldset className="space-y-4 rounded-2xl border border-stone-200 p-4">
        <legend className="px-2 text-sm font-semibold text-stone-900">Product variants</legend>
        <p className="text-sm leading-6 text-stone-600">
          Add options such as size or colour. Each active variant has its own SKU and stock; leave its price blank to use the product price. The product’s base stock is ignored while any variant is active.
        </p>
        {fields.map((field, index) => (
          <div key={field.formKey} className="grid gap-3 rounded-xl bg-stone-50 p-4 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" {...register(`variants.${index}.id`)} />
            <Field label={`Variant ${index + 1} name`} error={errors.variants?.[index]?.name?.message}>
              <input {...register(`variants.${index}.name`)} className={inputClass} placeholder="For example, Blue / Large" />
            </Field>
            <Field label="Variant SKU" error={errors.variants?.[index]?.sku?.message}>
              <input {...register(`variants.${index}.sku`)} className={inputClass} autoComplete="off" />
            </Field>
            <Field label="Price override (NGN, optional)" error={errors.variants?.[index]?.price?.message}>
              <input
                {...register(`variants.${index}.price`, { valueAsNumber: true })}
                type="number"
                min="1"
                step="1"
                className={inputClass}
                placeholder="Use product price"
              />
            </Field>
            <Field label="Variant stock" error={errors.variants?.[index]?.stock?.message}>
              <input
                {...register(`variants.${index}.stock`, { valueAsNumber: true })}
                type="number"
                min="0"
                step="1"
                readOnly={Boolean(field.id && product) || !canAdjustInventory}
                className={`${inputClass} read-only:bg-stone-100`}
              />
            </Field>
            <label className="inline-flex items-center gap-2 text-sm text-stone-700">
              <input {...register(`variants.${index}.active`)} type="checkbox" className="h-4 w-4 accent-stone-900" />
              Available for sale
            </label>
            {product && field.id ? (
              <p className="text-xs leading-5 text-stone-500 md:col-span-2">
                Use the variant stock control in the product list to adjust this variant’s inventory.
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => remove(index)}
              className="justify-self-start rounded-full border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-white"
            >
              Remove variant
            </button>
          </div>
        ))}
        {errors.variants?.message ? <p role="alert" className="text-sm text-red-600">{errors.variants.message}</p> : null}
        <p className="text-xs leading-5 text-stone-500">Removed variants are deactivated and retained for existing orders. Adjust saved variant stock separately so each change is audited.</p>
        <button
          type="button"
          onClick={() => append({ name: '', sku: '', price: undefined, stock: 0, active: true })}
          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          Add variant
        </button>
      </fieldset>

      <div className="flex flex-wrap gap-5">
        <label className="inline-flex items-center gap-2 text-sm text-stone-700">
          <input {...register('featured')} type="checkbox" className="h-4 w-4 accent-stone-900" />
          Feature on the homepage
        </label>
        <label className="inline-flex items-center gap-2 text-sm text-stone-700">
          <input {...register('published')} type="checkbox" className="h-4 w-4 accent-stone-900" />
          Publish in the customer store
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={isSaving || uploadingImage !== null}
          className="rounded-full bg-stone-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? 'Saving…' : uploadingImage ? 'Uploading image…' : product ? 'Save changes' : 'Save product'}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} className="rounded-full border border-stone-300 px-5 py-3 text-sm font-medium text-stone-700 hover:bg-stone-50">
            Cancel
          </button>
        ) : null}
        <p role="status" aria-live="polite" className="text-sm text-stone-600">{message}</p>
      </div>
      <p className="text-xs leading-5 text-stone-500">
        Upload JPEG, PNG, WebP, or AVIF images up to 8 MB, or enter an existing HTTPS image URL. No example products are preloaded.
      </p>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2 text-sm font-medium text-stone-700">
      <span>{label}</span>
      {children}
      {error ? <span className="block text-xs font-normal text-red-600">{error}</span> : null}
    </label>
  );
}

const inputClass = 'w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none focus:border-stone-900';
