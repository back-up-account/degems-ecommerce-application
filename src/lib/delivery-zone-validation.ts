import { z } from 'zod';

const MAX_DATABASE_INTEGER = 2_147_483_647;
const MAX_DELIVERY_FEE_NAIRA = Math.floor(MAX_DATABASE_INTEGER / 100);
const deliveryFeeNaira = z.number().int().nonnegative().max(MAX_DELIVERY_FEE_NAIRA)
  .transform((value) => value * 100);

export const deliveryZoneInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  deliveryFee: deliveryFeeNaira,
}).strict();

export const deliveryZoneActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set_status'),
    zoneId: z.string().uuid(),
    active: z.boolean(),
  }).strict(),
  z.object({
    action: z.literal('update_fee'),
    zoneId: z.string().uuid(),
    deliveryFee: deliveryFeeNaira,
  }).strict(),
]);
