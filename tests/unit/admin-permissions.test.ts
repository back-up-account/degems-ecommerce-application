import { describe, expect, it } from 'vitest';
import { hasAdminPermission, isStaffRole, type AdminPermission } from '@api/lib/admin-permissions';
import type { UserRole } from '@prisma/client';

const permissions: AdminPermission[] = [
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
  'audit.view',
];

const expectedPermissions: Record<UserRole, AdminPermission[]> = {
  ADMIN: permissions,
  CATALOG_STAFF: ['catalog.view', 'catalog.manage'],
  INVENTORY_STAFF: ['catalog.view', 'inventory.adjust'],
  FULFILLMENT_STAFF: ['orders.view', 'orders.fulfill'],
  FINANCE_STAFF: ['orders.view', 'payments.confirm', 'payments.refund'],
  CUSTOMER: [],
};

describe('admin staff role permissions', () => {
  it('grants exactly the operational permissions assigned to each role', () => {
    for (const role of Object.keys(expectedPermissions) as UserRole[]) {
      const actual = permissions.filter((permission) => hasAdminPermission(role, permission));
      expect(actual).toEqual(expectedPermissions[role]);
    }
  });

  it('recognizes only non-customer roles as staff', () => {
    expect(isStaffRole('ADMIN')).toBe(true);
    expect(isStaffRole('CATALOG_STAFF')).toBe(true);
    expect(isStaffRole('CUSTOMER')).toBe(false);
    expect(isStaffRole(null)).toBe(false);
  });
});
