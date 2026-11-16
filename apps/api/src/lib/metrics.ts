import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { prisma } from '@api/lib/prisma';

type ApplicationMetrics = {
  registry: Registry;
  httpRequests: Counter<string>;
  httpRequestDuration: Histogram<string>;
  checkoutOnboarding: Counter<string>;
  orders: Counter<string>;
  payments: Counter<string>;
  reservations: Counter<string>;
  activeGuestCarts: Gauge<string>;
  ordersByStatus: Gauge<string>;
  paymentsByStatus: Gauge<string>;
  reservationsByStatus: Gauge<string>;
  notificationsByStatus: Gauge<string>;
  notificationOldestAge: Gauge<string>;
};

const globalForMetrics = globalThis as typeof globalThis & {
  degemsMetrics?: ApplicationMetrics;
};

function createApplicationMetrics(): ApplicationMetrics {
  const registry = new Registry();
  registry.setDefaultLabels({ service: 'degems-ecommerce' });
  collectDefaultMetrics({ register: registry });

  return {
    registry,
    httpRequests: new Counter({
      name: 'ecommerce_http_requests_total',
      help: 'HTTP requests handled by application routes.',
      labelNames: ['method', 'route', 'status'],
      registers: [registry],
    }),
    httpRequestDuration: new Histogram({
      name: 'ecommerce_http_request_duration_seconds',
      help: 'HTTP route handler duration in seconds.',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [registry],
    }),
    checkoutOnboarding: new Counter({
      name: 'checkout_onboarding_total',
      help: 'Checkout onboarding activity by authentication method.',
      labelNames: ['method'],
      registers: [registry],
    }),
    orders: new Counter({
      name: 'ecommerce_orders_total',
      help: 'Order state entries recorded by this application instance.',
      labelNames: ['status'],
      registers: [registry],
    }),
    payments: new Counter({
      name: 'ecommerce_payments_total',
      help: 'Payment state entries recorded by this application instance.',
      labelNames: ['status', 'method'],
      registers: [registry],
    }),
    reservations: new Counter({
      name: 'inventory_reservations_total',
      help: 'Inventory reservation and release events recorded by this application instance.',
      labelNames: ['status'],
      registers: [registry],
    }),
    activeGuestCarts: new Gauge({
      name: 'active_guest_carts',
      help: 'Guest carts that have not expired.',
      registers: [registry],
    }),
    ordersByStatus: new Gauge({
      name: 'ecommerce_orders_current',
      help: 'Current order count grouped by status.',
      labelNames: ['status'],
      registers: [registry],
    }),
    paymentsByStatus: new Gauge({
      name: 'ecommerce_payments_current',
      help: 'Current payment count grouped by status and method.',
      labelNames: ['status', 'method'],
      registers: [registry],
    }),
    reservationsByStatus: new Gauge({
      name: 'inventory_reservations_current',
      help: 'Current inventory reservations grouped by state.',
      labelNames: ['status'],
      registers: [registry],
    }),
    notificationsByStatus: new Gauge({
      name: 'ecommerce_notification_jobs',
      help: 'Notification outbox jobs grouped by delivery status and channel.',
      labelNames: ['status', 'channel'],
      registers: [registry],
    }),
    notificationOldestAge: new Gauge({
      name: 'ecommerce_notification_oldest_age_seconds',
      help: 'Age in seconds of the oldest notification outbox job grouped by status and channel.',
      labelNames: ['status', 'channel'],
      registers: [registry],
    }),
  };
}

const applicationMetrics = globalForMetrics.degemsMetrics ?? createApplicationMetrics();
globalForMetrics.degemsMetrics = applicationMetrics;

export function recordHttpRequest(method: string, route: string, status: number, durationMs: number) {
  const labels = { method, route, status: String(status) };
  applicationMetrics.httpRequests.inc(labels);
  applicationMetrics.httpRequestDuration.observe(labels, durationMs / 1000);
}

export function recordCheckoutOnboarding(method: 'guest' | 'google' | 'native') {
  applicationMetrics.checkoutOnboarding.inc({ method });
}

export function recordOrderStatus(status: string) {
  applicationMetrics.orders.inc({ status: allowedLabel(status) });
}

export function recordPaymentStatus(status: string, method: string) {
  applicationMetrics.payments.inc({ status: allowedLabel(status), method: allowedLabel(method) });
}

export function recordReservationEvent(status: 'reserved' | 'released', count = 1) {
  applicationMetrics.reservations.inc({ status }, count);
}

export async function refreshDatabaseMetrics() {
  const now = new Date();
  const [
    activeCarts,
    orderGroups,
    paymentGroups,
    activeReservations,
    expiredReservations,
    releasedReservations,
    notificationGroups,
  ] = await Promise.all([
    prisma.cart.count({ where: { expiresAt: { gt: now } } }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.payment.groupBy({ by: ['status', 'method'], _count: { _all: true } }),
    prisma.inventoryReservation.count({ where: { releasedAt: null, expiresAt: { gt: now } } }),
    prisma.inventoryReservation.count({ where: { releasedAt: null, expiresAt: { lte: now } } }),
    prisma.inventoryReservation.count({ where: { releasedAt: { not: null } } }),
    prisma.notification.groupBy({
      by: ['status', 'channel'],
      _count: { _all: true },
      _min: { createdAt: true },
    }),
  ]);

  applicationMetrics.activeGuestCarts.set(activeCarts);
  applicationMetrics.ordersByStatus.reset();
  for (const group of orderGroups) {
    applicationMetrics.ordersByStatus.set({ status: allowedLabel(group.status) }, group._count._all);
  }
  applicationMetrics.paymentsByStatus.reset();
  for (const group of paymentGroups) {
    applicationMetrics.paymentsByStatus.set({
      status: allowedLabel(group.status),
      method: allowedLabel(group.method),
    }, group._count._all);
  }
  applicationMetrics.reservationsByStatus.reset();
  applicationMetrics.reservationsByStatus.set({ status: 'active' }, activeReservations);
  applicationMetrics.reservationsByStatus.set({ status: 'expired_unreleased' }, expiredReservations);
  applicationMetrics.reservationsByStatus.set({ status: 'released' }, releasedReservations);
  applicationMetrics.notificationsByStatus.reset();
  applicationMetrics.notificationOldestAge.reset();
  for (const group of notificationGroups) {
    const labels = {
      status: allowedLabel(group.status),
      channel: allowedLabel(group.channel),
    };
    applicationMetrics.notificationsByStatus.set(labels, group._count._all);
    if (group._min.createdAt) {
      applicationMetrics.notificationOldestAge.set(
        labels,
        Math.max(0, (now.getTime() - group._min.createdAt.getTime()) / 1000),
      );
    }
  }
}

export function getMetricsRegistry() {
  return applicationMetrics.registry;
}

function allowedLabel(value: string) {
  return /^[a-z][a-z0-9_]{0,40}$/.test(value) ? value : 'other';
}
