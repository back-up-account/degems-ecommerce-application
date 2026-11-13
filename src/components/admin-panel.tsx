'use client';

import { formatNairaFromKobo } from '@/lib/utils';
import { Fragment, useState } from 'react';
import { ProductForm, type EditableProduct } from '@/components/product-form';
import { StockAdjustmentForm } from '@/components/stock-adjustment-form';

export type AdminProduct = Omit<EditableProduct, 'categorySlug'> & { category: { name: string; slug: string } };

export function AdminPanel({
  products,
  canManageCatalog = true,
  canAdjustInventory = true,
}: {
  products: AdminProduct[];
  canManageCatalog?: boolean;
  canAdjustInventory?: boolean;
}) {
  const [activeProductAction, setActiveProductAction] = useState<{
    productId: string;
    action: 'edit' | 'stock' | 'variantStock';
    variantId?: string;
  } | null>(null);
  const tableColumnCount = 5 + Number(canAdjustInventory) + Number(canManageCatalog);

  return (
    <div className="space-y-8">
      {canManageCatalog ? <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="mb-2 text-xs uppercase tracking-[0.24em] text-stone-500">Your catalogue</p>
          <h2 className="text-2xl font-semibold text-stone-900">Add a product</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
            You control the product selection and listings. New products stay unpublished unless you choose to show them in the store.
          </p>
        </div>
        <ProductForm canAdjustInventory={canAdjustInventory} />
      </section> : null}

      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.24em] text-stone-500">Inventory</p>
            <h2 className="text-2xl font-semibold text-stone-900">Products you added</h2>
          </div>
          <span className="text-sm text-stone-500">{products.length} total</span>
        </div>

        {products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-10 text-center">
            <p className="font-medium text-stone-900">Your product catalogue is empty.</p>
            <p className="mt-2 text-sm text-stone-600">Add your first listing above; nothing has been seeded for you.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Product catalogue and available inventory</caption>
              <thead className="border-b border-stone-200 text-stone-500">
                <tr>
                  <th scope="col" className="pb-3 pr-4 font-medium">Product</th>
                  <th scope="col" className="pb-3 pr-4 font-medium">Department</th>
                  <th scope="col" className="pb-3 pr-4 font-medium">SKU</th>
                  {canAdjustInventory ? <th scope="col" className="pb-3 pr-4 font-medium">Stock</th> : null}
                  <th scope="col" className="pb-3 pr-4 font-medium">Visibility</th>
                  {canManageCatalog ? <th scope="col" className="pb-3 text-right font-medium">Price</th> : null}
                  <th scope="col" className="pb-3 pl-4 text-right font-medium">Manage</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <Fragment key={product.id}>
                    <tr className="border-b border-stone-100 last:border-b-0">
                      <td className="py-4 pr-4 font-medium text-stone-900">{product.name}</td>
                      <td className="py-4 pr-4 text-stone-600">{product.category.name}</td>
                      <td className="py-4 pr-4 text-stone-600">{product.sku}</td>
                      {canAdjustInventory ? <td className="py-4 pr-4 text-stone-600">
                        {product.variants.some((variant) => variant.active)
                          ? product.variants.filter((variant) => variant.active).reduce((total, variant) => total + variant.stock, 0)
                          : product.stock}
                      </td> : null}
                      <td className="py-4 pr-4">
                        <span className="rounded-full bg-stone-100 px-2 py-1 text-xs font-medium text-stone-700">
                          {product.published ? 'Published' : 'Draft'}
                        </span>
                      </td>
                      {canManageCatalog ? <td className="py-4 text-right font-medium text-stone-900">{formatNairaFromKobo(product.price)}</td> : null}
                      <td className="py-4 pl-4 text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          {canManageCatalog ? (
                            <button
                              type="button"
                              aria-expanded={activeProductAction?.productId === product.id && activeProductAction.action === 'edit'}
                              onClick={() => setActiveProductAction(
                                activeProductAction?.productId === product.id && activeProductAction.action === 'edit'
                                  ? null
                                  : { productId: product.id, action: 'edit' },
                              )}
                              className="rounded-full border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50"
                            >
                              Edit
                            </button>
                          ) : null}
                          {canAdjustInventory && !product.variants.some((variant) => variant.active) ? (
                            <button
                              type="button"
                              aria-expanded={activeProductAction?.productId === product.id && activeProductAction.action === 'stock'}
                              onClick={() => setActiveProductAction(
                                activeProductAction?.productId === product.id && activeProductAction.action === 'stock'
                                  ? null
                                  : { productId: product.id, action: 'stock' },
                              )}
                              className="rounded-full border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50"
                            >
                              Adjust stock
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {activeProductAction?.productId === product.id
                      && ((canManageCatalog && activeProductAction.action === 'edit')
                        || (canAdjustInventory && activeProductAction.action === 'stock')) ? (
                      <tr className="border-b border-stone-100">
                        <td colSpan={tableColumnCount} className="py-5">
                          {activeProductAction.action === 'edit' ? (
                            <ProductForm
                              product={{ ...product, categorySlug: product.category.slug }}
                              onCancel={() => setActiveProductAction(null)}
                              canAdjustInventory={canAdjustInventory}
                            />
                          ) : (
                            <StockAdjustmentForm
                              productId={product.id}
                              currentStock={product.stock}
                              onCancel={() => setActiveProductAction(null)}
                            />
                          )}
                        </td>
                      </tr>
                    ) : null}
                    {product.variants.map((variant) => (
                      <Fragment key={variant.id}>
                        <tr className="border-b border-stone-100 bg-stone-50/70">
                          <td className="py-3 pl-6 pr-4 text-stone-700">{variant.name}{variant.active ? '' : ' (inactive)'}</td>
                          <td className="py-3 pr-4 text-stone-500">Variant</td>
                          <td className="py-3 pr-4 text-stone-600">{variant.sku}</td>
                          {canAdjustInventory ? <td className="py-3 pr-4 text-stone-600">{variant.stock}</td> : null}
                          <td className="py-3 pr-4 text-stone-600">{variant.active ? 'Available' : 'Inactive'}</td>
                          {canManageCatalog ? <td className="py-3 text-right text-stone-700">
                            {formatNairaFromKobo(variant.price ?? product.price)}
                          </td> : null}
                          <td className="py-3 pl-4 text-right">
                            {canAdjustInventory ? (
                              <button
                                type="button"
                                aria-expanded={activeProductAction?.variantId === variant.id && activeProductAction.action === 'variantStock'}
                                onClick={() => setActiveProductAction(
                                  activeProductAction?.variantId === variant.id && activeProductAction.action === 'variantStock'
                                    ? null
                                    : { productId: product.id, variantId: variant.id, action: 'variantStock' },
                                )}
                                className="rounded-full border border-stone-300 px-3 py-2 text-xs font-medium text-stone-700 hover:bg-white"
                              >
                                Adjust variant stock
                              </button>
                            ) : null}
                          </td>
                        </tr>
                        {canAdjustInventory && activeProductAction?.variantId === variant.id && activeProductAction.action === 'variantStock' ? (
                          <tr className="border-b border-stone-100">
                            <td colSpan={tableColumnCount} className="py-5 pl-6">
                              <StockAdjustmentForm
                                variantId={variant.id}
                                currentStock={variant.stock}
                                onCancel={() => setActiveProductAction(null)}
                              />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
