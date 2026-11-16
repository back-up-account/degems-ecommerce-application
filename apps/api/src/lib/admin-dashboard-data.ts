import type { UserRole } from '@prisma/client';
import type {
  AdminAuditEvent,
  AdminCustomer,
  AdminDashboardData,
  AdminDeliveryZone,
  AdminOrder,
  AdminProduct,
} from '@api/lib/admin-dashboard-types';
import { prisma } from '@api/lib/prisma';
import { hasAdminPermission } from '@api/lib/admin-permissions';
import { listAdminProducts } from '@api/lib/catalog';

export async function getAdminDashboardData(role: UserRole): Promise<AdminDashboardData> {
  const canViewCatalog = hasAdminPermission(role, 'catalog.view');
  const canManageCatalog = hasAdminPermission(role, 'catalog.manage');
  const canAdjustInventory = hasAdminPermission(role, 'inventory.adjust');
  const canViewOrders = hasAdminPermission(role, 'orders.view');
  const canManagePayments = hasAdminPermission(role, 'payments.confirm')
    || hasAdminPermission(role, 'payments.refund');
  const [rawProducts, rawOrders, rawDeliveryZones, rawCustomers, rawAuditEvents] = await Promise.all([
    canViewCatalog ? listAdminProducts() : Promise.resolve([]),
    canViewOrders ? prisma.order.findMany({
      include: {
        items: true,
        payment: canManagePayments ? true : { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }) : Promise.resolve([]),
    hasAdminPermission(role, 'delivery.manage') ? prisma.deliveryZone.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, deliveryFee: true, active: true },
    }) : Promise.resolve([]),
    hasAdminPermission(role, 'customers.manage') ? prisma.user.findMany({
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
    hasAdminPermission(role, 'audit.view') ? prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        createdAt: true,
        actor: { select: { name: true, email: true } },
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
    deliveryAddress: hasAdminPermission(role, 'orders.fulfill') || role === 'ADMIN'
      ? order.deliveryAddress
      : null,
    dispatchProvider: hasAdminPermission(role, 'orders.fulfill') || role === 'ADMIN'
      ? order.dispatchProvider
      : null,
    dispatchReference: hasAdminPermission(role, 'orders.fulfill') || role === 'ADMIN'
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
  const auditEvents: AdminAuditEvent[] = rawAuditEvents.map((event) => ({
    id: event.id,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId,
    actorLabel: event.actor
      ? event.actor.name
        ? `${event.actor.name} (${event.actor.email})`
        : event.actor.email
      : 'System',
    createdAt: event.createdAt.toISOString(),
  }));

  return {
    products,
    orders,
    customers,
    deliveryZones,
    auditEvents,
    permissions: {
      catalog: canViewCatalog,
      orders: canViewOrders,
      customers: hasAdminPermission(role, 'customers.manage'),
      delivery: hasAdminPermission(role, 'delivery.manage'),
      notifications: hasAdminPermission(role, 'notifications.manage'),
      staff: hasAdminPermission(role, 'staff.manage'),
      security: hasAdminPermission(role, 'security.manage'),
      audit: hasAdminPermission(role, 'audit.view'),
    },
    canManageCatalog,
    canAdjustInventory,
    canFulfill: hasAdminPermission(role, 'orders.fulfill'),
    canCancel: hasAdminPermission(role, 'orders.cancel'),
    canManagePayments,
    canViewOrderValues: canManagePayments,
    canViewDeliveryAddress: hasAdminPermission(role, 'orders.fulfill') || role === 'ADMIN',
  };
}
