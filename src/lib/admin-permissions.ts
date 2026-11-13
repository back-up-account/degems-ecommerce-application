import type { UserRole } from '@prisma/client';

export type AdminPermission =
  | 'catalog.view'
  | 'catalog.manage'
  | 'inventory.adjust'
  | 'orders.view'
  | 'orders.fulfill'
  | 'orders.cancel'
  | 'payments.confirm'
  | 'payments.refund'
  | 'customers.manage'
  | 'delivery.manage'
  | 'notifications.manage'
  | 'staff.manage'
  | 'security.manage';

const permissionsByRole: Record<UserRole, ReadonlySet<AdminPermission>> = {
  ADMIN: new Set([
    'catalog.view',
    'catalog.manage',
    'inventory.adjust',
    'orders.view',
    'orders.fulfill',
    'orders.cancel',
    'payments.confirm',
    'payments.refund',
    'customers.manage',
    'delivery.manage',
    'notifications.manage',
    'staff.manage',
    'security.manage',
  ]),
  CATALOG_STAFF: new Set(['catalog.view', 'catalog.manage']),
  INVENTORY_STAFF: new Set(['catalog.view', 'inventory.adjust']),
  FULFILLMENT_STAFF: new Set(['orders.view', 'orders.fulfill']),
  FINANCE_STAFF: new Set(['orders.view', 'payments.confirm', 'payments.refund']),
  CUSTOMER: new Set(),
};

export const STAFF_ROLES = [
  'CATALOG_STAFF',
  'INVENTORY_STAFF',
  'FULFILLMENT_STAFF',
  'FINANCE_STAFF',
] as const satisfies readonly UserRole[];

export function isStaffRole(role: UserRole | null | undefined): role is Exclude<UserRole, 'CUSTOMER'> {
  return Boolean(role && role !== 'CUSTOMER');
}

export function hasAdminPermission(role: UserRole | null | undefined, permission: AdminPermission) {
  return role ? permissionsByRole[role]?.has(permission) ?? false : false;
}

export function getStaffRoleLabel(role: UserRole) {
  const labels: Partial<Record<UserRole, string>> = {
    ADMIN: 'Owner / administrator',
    CATALOG_STAFF: 'Catalog staff',
    INVENTORY_STAFF: 'Inventory staff',
    FULFILLMENT_STAFF: 'Fulfillment staff',
    FINANCE_STAFF: 'Finance staff',
  };
  return labels[role] ?? 'Customer';
}
