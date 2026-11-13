import { describe, expect, it } from 'vitest';
import { hasAdminPermission, isStaffRole } from '@/lib/admin-permissions';

describe('admin staff role permissions', () => {
  it('grants each staff role only its operational capabilities', () => {
    expect(hasAdminPermission('CATALOG_STAFF', 'catalog.manage')).toBe(true);
    expect(hasAdminPermission('CATALOG_STAFF', 'inventory.adjust')).toBe(false);
    expect(hasAdminPermission('CATALOG_STAFF', 'payments.confirm')).toBe(false);

    expect(hasAdminPermission('INVENTORY_STAFF', 'inventory.adjust')).toBe(true);
    expect(hasAdminPermission('INVENTORY_STAFF', 'catalog.manage')).toBe(false);

    expect(hasAdminPermission('FULFILLMENT_STAFF', 'orders.fulfill')).toBe(true);
    expect(hasAdminPermission('FULFILLMENT_STAFF', 'payments.confirm')).toBe(false);
    expect(hasAdminPermission('FULFILLMENT_STAFF', 'orders.cancel')).toBe(false);

    expect(hasAdminPermission('FINANCE_STAFF', 'payments.confirm')).toBe(true);
    expect(hasAdminPermission('FINANCE_STAFF', 'payments.refund')).toBe(true);
    expect(hasAdminPermission('FINANCE_STAFF', 'orders.fulfill')).toBe(false);
    expect(hasAdminPermission('FINANCE_STAFF', 'orders.cancel')).toBe(false);

    expect(hasAdminPermission('ADMIN', 'staff.manage')).toBe(true);
    expect(hasAdminPermission('CUSTOMER', 'catalog.view')).toBe(false);
  });

  it('recognizes only non-customer roles as staff', () => {
    expect(isStaffRole('ADMIN')).toBe(true);
    expect(isStaffRole('CATALOG_STAFF')).toBe(true);
    expect(isStaffRole('CUSTOMER')).toBe(false);
    expect(isStaffRole(null)).toBe(false);
  });
});
