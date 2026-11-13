import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { AdminPanel, type AdminProduct } from '@/components/admin-panel';
import { authConfig } from '@/lib/auth';
import { listAdminProducts } from '@/lib/catalog';
import { AdminOrderPayments, type AdminOrder } from '@/components/admin-order-payments';
import { AdminCustomers, type AdminCustomer } from '@/components/admin-customers';
import { DeliveryZoneManager, type AdminDeliveryZone } from '@/components/delivery-zone-manager';
import { AdminSecuritySettings } from '@/components/admin-security-settings';
import { prisma } from '@/lib/prisma';
import { hasAdminPermission, getStaffRoleLabel } from '@/lib/admin-permissions';
import { AdminStaffManager } from '@/components/admin-staff-manager';
import { AdminNotificationManager } from '@/components/admin-notification-manager';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const session = await getServerSession(authConfig);

  if (!session?.user.id) {
    redirect('/account?callbackUrl=%2Fadmin');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, mfaEnabledAt: true, disabledAt: true },
  });

  if (!user || user.disabledAt || !user.mfaEnabledAt || user.role === 'CUSTOMER') {
    redirect('/');
  }

  const canViewCatalog = hasAdminPermission(user.role, 'catalog.view');
  const canManageCatalog = hasAdminPermission(user.role, 'catalog.manage');
  const canAdjustInventory = hasAdminPermission(user.role, 'inventory.adjust');
  const canViewOrders = hasAdminPermission(user.role, 'orders.view');
  const canManagePayments = hasAdminPermission(user.role, 'payments.confirm')
    || hasAdminPermission(user.role, 'payments.refund');
  const [rawProducts, rawOrders, rawDeliveryZones, rawCustomers] = await Promise.all([
    canViewCatalog ? listAdminProducts() : Promise.resolve([]),
    canViewOrders ? prisma.order.findMany({
      include: {
        items: true,
        payment: canManagePayments ? true : { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }) : Promise.resolve([]),
    hasAdminPermission(user.role, 'delivery.manage') ? prisma.deliveryZone.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, deliveryFee: true, active: true },
    }) : Promise.resolve([]),
    hasAdminPermission(user.role, 'customers.manage') ? prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        disabledAt: true,
        _count: { select: { orders: true } },
      },
    }) : Promise.resolve([]),
  ]);
  const products: AdminProduct[] = rawProducts.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: { name: product.category.name, slug: product.category.slug },
    subcategory: product.subcategory,
    shortDescription: canManageCatalog ? product.shortDescription : '',
    description: canManageCatalog ? product.description : '',
    price: canManageCatalog ? product.price : 0,
    compareAtPrice: canManageCatalog ? product.compareAtPrice : null,
    image: canManageCatalog ? product.image : '',
    gallery: canManageCatalog && Array.isArray(product.gallery)
      ? product.gallery.filter((image): image is string => typeof image === 'string')
      : [],
    variants: product.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      price: canManageCatalog ? variant.price : null,
      stock: canAdjustInventory ? variant.stock : 0,
      active: variant.active,
    })),
    stock: canAdjustInventory ? product.stock : 0,
    featured: product.featured,
    published: product.published,
  }));
  const orders: AdminOrder[] = rawOrders.map((order) => ({
    id: order.id,
    status: order.status,
    total: canManagePayments ? order.total : 0,
    createdAt: order.createdAt.toISOString(),
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    deliveryMethod: order.deliveryMethod,
    deliveryFee: canManagePayments ? order.deliveryFee : 0,
    deliveryZoneName: order.deliveryZoneName,
    deliveryAddress: hasAdminPermission(user.role, 'orders.fulfill') || user.role === 'ADMIN'
      ? order.deliveryAddress
      : null,
    dispatchProvider: hasAdminPermission(user.role, 'orders.fulfill') || user.role === 'ADMIN'
      ? order.dispatchProvider
      : null,
    dispatchReference: hasAdminPermission(user.role, 'orders.fulfill') || user.role === 'ADMIN'
      ? order.dispatchReference
      : null,
    cancellationReason: order.cancellationReason,
    payment: order.payment ? {
      status: order.payment.status,
      ...(canManagePayments && 'reference' in order.payment ? {
        reference: order.payment.reference,
        bankTransferReference: order.payment.bankTransferReference,
        refundReference: order.payment.refundReference,
      } : {}),
    } : null,
    items: order.items.map((item) => ({
      id: item.id,
      name: item.name,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: canManagePayments ? item.unitPrice : 0,
    })),
  }));
  const deliveryZones: AdminDeliveryZone[] = rawDeliveryZones;
  const customers: AdminCustomer[] = rawCustomers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    email: customer.email,
    createdAt: customer.createdAt.toISOString(),
    disabledAt: customer.disabledAt?.toISOString() ?? null,
    orderCount: customer._count.orders,
  }));

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <p className="mb-2 text-xs uppercase tracking-[0.28em] text-stone-500">DEGEMS store operations</p>
        <h1 className="text-4xl font-semibold tracking-tight text-stone-900">
          {user.role === 'ADMIN' ? 'Store administration' : getStaffRoleLabel(user.role)}
        </h1>
      </div>
      <div className="space-y-8">
        {hasAdminPermission(user.role, 'security.manage') ? <AdminSecuritySettings /> : null}
        {hasAdminPermission(user.role, 'staff.manage') ? <AdminStaffManager /> : null}
        {hasAdminPermission(user.role, 'notifications.manage') ? <AdminNotificationManager /> : null}
        {hasAdminPermission(user.role, 'delivery.manage') ? <DeliveryZoneManager zones={deliveryZones} /> : null}
        {hasAdminPermission(user.role, 'customers.manage') ? <AdminCustomers customers={customers} /> : null}
        {canViewOrders ? (
          <AdminOrderPayments
            orders={orders}
            canFulfill={hasAdminPermission(user.role, 'orders.fulfill')}
            canCancel={hasAdminPermission(user.role, 'orders.cancel')}
            canManagePayments={canManagePayments}
            canViewOrderValues={canManagePayments}
            canViewDeliveryAddress={hasAdminPermission(user.role, 'orders.fulfill') || user.role === 'ADMIN'}
          />
        ) : null}
        {canViewCatalog ? (
          <AdminPanel
            products={products}
            canManageCatalog={canManageCatalog}
            canAdjustInventory={canAdjustInventory}
          />
        ) : null}
      </div>
    </main>
  );
}
