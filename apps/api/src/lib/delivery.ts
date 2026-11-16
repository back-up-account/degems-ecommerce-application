import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@api/lib/prisma';
import type { GuestCheckoutDetails } from '@api/lib/checkout-validation';

type DeliveryDatabase = Pick<PrismaClient, 'deliveryZone'> | Pick<Prisma.TransactionClient, 'deliveryZone'>;

export type ActiveDeliveryZone = {
  id: string;
  name: string;
  deliveryFee: number;
};

export class DeliveryZoneUnavailableError extends Error {
  constructor() {
    super('That delivery area is no longer available. Choose another option.');
    this.name = 'DeliveryZoneUnavailableError';
  }
}

export async function listActiveDeliveryZones(): Promise<ActiveDeliveryZone[]> {
  return prisma.deliveryZone.findMany({
    where: { active: true },
    select: { id: true, name: true, deliveryFee: true },
    orderBy: { name: 'asc' },
  });
}

export async function quoteDelivery(
  customer: GuestCheckoutDetails,
  database: DeliveryDatabase = prisma,
) {
  if (customer.deliveryMethod === 'pickup') {
    return {
      deliveryMethod: 'pickup' as const,
      deliveryFee: 0,
      deliveryZoneId: null,
      deliveryZoneName: null,
      deliveryAddress: null,
    };
  }

  const zone = await database.deliveryZone.findFirst({
    where: { id: customer.deliveryZoneId, active: true },
    select: { id: true, name: true, deliveryFee: true },
  });
  if (!zone) throw new DeliveryZoneUnavailableError();

  return {
    deliveryMethod: 'door_delivery' as const,
    deliveryFee: zone.deliveryFee,
    deliveryZoneId: zone.id,
    deliveryZoneName: zone.name,
    deliveryAddress: customer.deliveryAddress,
  };
}
