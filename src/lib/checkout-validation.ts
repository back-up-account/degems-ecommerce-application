import { z } from 'zod';

const guestContactSchema = z.object({
  fullName: z.string().trim().min(2).max(120).refine(
    (value) => value.split(/\s+/).length >= 2,
    'Enter your first and last name.',
  ),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  phone: z.string().trim().min(8).max(24)
    .transform((value) => value.replace(/[()\s-]/g, ''))
    .refine(
      (value) => /^(?:0[789]\d{9}|\+?234[789]\d{9})$/.test(value),
      'Enter a valid Nigerian mobile number.',
    )
    .transform((value) => (value.startsWith('0') ? `+234${value.slice(1)}` : value.startsWith('+') ? value : `+${value}`)),
});

const pickupCheckoutSchema = guestContactSchema.extend({
  deliveryMethod: z.literal('pickup').default('pickup'),
}).transform((value) => ({
  ...value,
  deliveryMethod: 'pickup' as const,
}));

const doorDeliveryCheckoutSchema = guestContactSchema.extend({
  deliveryMethod: z.literal('door_delivery'),
  deliveryZoneId: z.string().uuid(),
  deliveryAddress: z.string().trim().min(5).max(500),
});

export const guestCheckoutSchema = z.union([pickupCheckoutSchema, doorDeliveryCheckoutSchema]);

export type GuestCheckoutInput = z.input<typeof guestCheckoutSchema>;
export type GuestCheckoutDetails = z.output<typeof guestCheckoutSchema>;
