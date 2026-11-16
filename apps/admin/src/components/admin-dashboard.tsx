'use client';

import {
  Bell,
  ClipboardList,
  MapPin,
  Package,
  ShieldCheck,
  ShoppingCart,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import type {
  AdminDashboardData,
  AdminSectionId,
} from '@api/lib/admin-dashboard-types';
import { AdminCustomers } from '@/components/admin-customers';
import { AdminAuditLog } from '@/components/admin-audit-log';
import { AdminNotificationManager } from '@/components/admin-notification-manager';
import { AdminOrderPayments } from '@/components/admin-order-payments';
import { AdminPanel } from '@/components/admin-panel';
import { AdminSecuritySettings } from '@/components/admin-security-settings';
import { AdminStaffManager } from '@/components/admin-staff-manager';
import { DeliveryZoneManager } from '@/components/delivery-zone-manager';

const sectionDetails: Record<AdminSectionId, { label: string; description: string; icon: LucideIcon }> = {
  catalog: {
    label: 'Product catalog',
    description: 'View available product listings.',
    icon: Package,
  },
  orders: {
    label: 'Orders & payments',
    description: 'Review customer orders, payment status and fulfillment.',
    icon: ShoppingCart,
  },
  customers: {
    label: 'Customers',
    description: 'Find customer accounts and manage access.',
    icon: Users,
  },
  delivery: {
    label: 'Delivery',
    description: 'Configure delivery zones, fees and availability.',
    icon: MapPin,
  },
  notifications: {
    label: 'Notifications',
    description: 'Review failed notifications and retry dispatch.',
    icon: Bell,
  },
  staff: {
    label: 'Staff access',
    description: 'Manage staff roles and administrator enrollment.',
    icon: UserCog,
  },
  security: {
    label: 'Security',
    description: 'Update your password and protect administrator access.',
    icon: ShieldCheck,
  },
  audit: {
    label: 'Activity & audit',
    description: 'Review recent recorded changes across store operations.',
    icon: ClipboardList,
  },
};

export function AdminDashboard({
  products,
  orders,
  customers,
  deliveryZones,
  auditEvents,
  permissions,
  canManageCatalog,
  canAdjustInventory,
  canFulfill,
  canCancel,
  canManagePayments,
  canViewOrderValues,
  canViewDeliveryAddress,
}: AdminDashboardData) {
  const catalogDetails = canManageCatalog
    ? canAdjustInventory
      ? {
        ...sectionDetails.catalog,
        label: 'Catalog & inventory',
        description: 'Create and publish listings, set prices, and manage stock.',
      }
      : {
        ...sectionDetails.catalog,
        description: 'Create and edit listings, set prices, and manage publication. Stock changes are reserved for inventory staff.',
      }
    : canAdjustInventory
      ? {
        ...sectionDetails.catalog,
        label: 'Inventory',
        description: 'View product identifiers and manage stock. Listing details and prices are read-only.',
      }
      : sectionDetails.catalog;
  const sections = (Object.keys(sectionDetails) as AdminSectionId[])
    .filter((id) => permissions[id])
    .map((id) => ({ id, ...(id === 'catalog' ? catalogDetails : sectionDetails[id]) }));
  const [activeSection, setActiveSection] = useState<AdminSectionId>(() => sections[0]?.id ?? 'catalog');
  const activeDetails = sections.find((section) => section.id === activeSection) ?? sections[0];

  if (!activeDetails) {
    return (
      <p role="status" className="rounded-2xl border border-stone-200 bg-white p-6 text-sm text-stone-600">
        No administration sections are assigned to this account.
      </p>
    );
  }

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
      <nav aria-label="Store administration sections" className="min-w-0 rounded-3xl border border-stone-200 bg-white p-3 shadow-sm lg:sticky lg:top-28">
        <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Management</p>
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {sections.map(({ id, label, icon: Icon }) => {
            const isActive = id === activeDetails.id;
            return (
              <button
                key={id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => setActiveSection(id)}
                className={`flex shrink-0 items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium transition lg:w-full ${
                  isActive
                    ? 'bg-stone-900 text-white shadow-sm'
                    : 'text-stone-600 hover:bg-stone-50 hover:text-stone-900'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-brass-200' : 'text-stone-500'}`} aria-hidden="true" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <section aria-label={activeDetails.label} className="min-w-0 space-y-5">
        <header className="rounded-3xl border border-stone-200 bg-white px-5 py-5 shadow-sm sm:px-6">
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-brass-600">Store management</p>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-900">{activeDetails.label}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">{activeDetails.description}</p>
        </header>

        <div className="min-w-0">
          {activeDetails.id === 'catalog' ? (
            <AdminPanel products={products} canManageCatalog={canManageCatalog} canAdjustInventory={canAdjustInventory} />
          ) : null}
          {activeDetails.id === 'orders' ? (
            <AdminOrderPayments
              orders={orders}
              canFulfill={canFulfill}
              canCancel={canCancel}
              canManagePayments={canManagePayments}
              canViewOrderValues={canViewOrderValues}
              canViewDeliveryAddress={canViewDeliveryAddress}
            />
          ) : null}
          {activeDetails.id === 'customers' ? <AdminCustomers customers={customers} /> : null}
          {activeDetails.id === 'delivery' ? <DeliveryZoneManager zones={deliveryZones} /> : null}
          {activeDetails.id === 'notifications' ? <AdminNotificationManager /> : null}
          {activeDetails.id === 'staff' ? <AdminStaffManager /> : null}
          {activeDetails.id === 'security' ? <AdminSecuritySettings /> : null}
          {activeDetails.id === 'audit' ? <AdminAuditLog events={auditEvents} /> : null}
        </div>
      </section>
    </div>
  );
}
