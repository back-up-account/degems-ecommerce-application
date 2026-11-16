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

export type AdminProduct = Omit<EditableProduct, 'categorySlug'> & {
  category: { name: string; slug: string };
};

export type AdminOrder = {
  id: string;
  status: string;
  total: number;
  createdAt: string;
  customerName: string | null;
  customerEmail: string | null;
  deliveryMethod: string | null;
  deliveryFee: number;
  deliveryZoneName: string | null;
  deliveryAddress: string | null;
  dispatchProvider: string | null;
  dispatchReference: string | null;
  cancellationReason: string | null;
  payment: {
    status: string;
    reference?: string;
    bankTransferReference?: string | null;
    refundReference?: string | null;
  } | null;
  items: Array<{
    id: string;
    name: string;
    variantName: string | null;
    quantity: number;
    unitPrice: number;
  }>;
};

export type AdminCustomer = {
  id: string;
  name: string | null;
  email: string;
  createdAt: string;
  disabledAt: string | null;
  orderCount: number;
};

export type AdminDeliveryZone = {
  id: string;
  name: string;
  deliveryFee: number;
  active: boolean;
};

export type AdminAuditEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorLabel: string;
  createdAt: string;
};

export type AdminSectionId =
  | 'catalog'
  | 'orders'
  | 'customers'
  | 'delivery'
  | 'notifications'
  | 'staff'
  | 'security'
  | 'audit';

export type AdminDashboardData = {
  products: AdminProduct[];
  orders: AdminOrder[];
  customers: AdminCustomer[];
  deliveryZones: AdminDeliveryZone[];
  auditEvents: AdminAuditEvent[];
  permissions: Record<AdminSectionId, boolean>;
  canManageCatalog: boolean;
  canAdjustInventory: boolean;
  canFulfill: boolean;
  canCancel: boolean;
  canManagePayments: boolean;
  canViewOrderValues: boolean;
  canViewDeliveryAddress: boolean;
};
