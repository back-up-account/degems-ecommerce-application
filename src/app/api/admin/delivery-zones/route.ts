import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { authorizeAdminPermission } from '@/lib/admin-api-auth';
import { instrumentHttpHandler } from '@/lib/http-metrics';
import { prisma } from '@/lib/prisma';
import { deliveryZoneActionSchema, deliveryZoneInputSchema } from '@/lib/delivery-zone-validation';

async function postDeliveryZone(request: Request) {
  const authorization = await authorizeAdminPermission('delivery.manage');
  if ('response' in authorization) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = deliveryZoneInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'Enter a delivery area and a valid whole-naira delivery fee.' },
      { status: 400 },
    );
  }

  try {
    const zone = await prisma.$transaction(async (transaction) => {
      const created = await transaction.deliveryZone.create({
        data: parsed.data,
        select: { id: true, name: true, deliveryFee: true, active: true },
      });
      await transaction.auditLog.create({
        data: {
          actorId: authorization.userId,
          action: 'delivery.zone.created',
          entityType: 'DeliveryZone',
          entityId: created.id,
          details: { name: created.name, deliveryFeeKobo: created.deliveryFee },
        },
      });
      return created;
    });

    return NextResponse.json({ zone }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ message: 'A delivery area with that name already exists.' }, { status: 409 });
    }
    throw error;
  }
}

async function patchDeliveryZone(request: Request) {
  const authorization = await authorizeAdminPermission('delivery.manage');
  if ('response' in authorization) return authorization.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: 'Request body must be valid JSON.' }, { status: 400 });
  }

  const parsed = deliveryZoneActionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: 'Choose a valid delivery area action and value.' }, { status: 400 });
  }

  try {
    const zone = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.deliveryZone.findUnique({
        where: { id: parsed.data.zoneId },
        select: { id: true, name: true, deliveryFee: true, active: true },
      });
      if (!existing) return null;
      if (parsed.data.action === 'update_fee') {
        if (existing.deliveryFee === parsed.data.deliveryFee) return existing;

        const updatedFee = await transaction.deliveryZone.updateMany({
          where: { id: existing.id, deliveryFee: existing.deliveryFee },
          data: { deliveryFee: parsed.data.deliveryFee },
        });
        if (updatedFee.count !== 1) {
          throw new DeliveryZoneUpdateConflictError();
        }

        await transaction.auditLog.create({
          data: {
            actorId: authorization.userId,
            action: 'delivery.zone.fee.updated',
            entityType: 'DeliveryZone',
            entityId: existing.id,
            details: {
              name: existing.name,
              previousDeliveryFeeKobo: existing.deliveryFee,
              deliveryFeeKobo: parsed.data.deliveryFee,
            },
          },
        });

        return { ...existing, deliveryFee: parsed.data.deliveryFee };
      }

      if (existing.active === parsed.data.active) return existing;

      const updated = await transaction.deliveryZone.updateMany({
        where: { id: existing.id, active: existing.active },
        data: { active: parsed.data.active },
      });
      if (updated.count !== 1) {
        throw new DeliveryZoneUpdateConflictError();
      }

      await transaction.auditLog.create({
        data: {
          actorId: authorization.userId,
          action: parsed.data.active ? 'delivery.zone.activated' : 'delivery.zone.deactivated',
          entityType: 'DeliveryZone',
          entityId: existing.id,
          details: { name: existing.name, active: parsed.data.active },
        },
      });

      return { ...existing, active: parsed.data.active };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!zone) return NextResponse.json({ message: 'Delivery area not found.' }, { status: 404 });
    return NextResponse.json({ zone });
  } catch (error) {
    if (error instanceof DeliveryZoneUpdateConflictError
      || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')) {
      return NextResponse.json({ message: 'Delivery area changed at the same time. Reload and try again.' }, { status: 409 });
    }
    throw error;
  }
}

class DeliveryZoneUpdateConflictError extends Error {}

export const POST = instrumentHttpHandler('/api/admin/delivery-zones', 'POST', postDeliveryZone);
export const PATCH = instrumentHttpHandler('/api/admin/delivery-zones', 'PATCH', patchDeliveryZone);
