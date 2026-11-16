import { z } from 'zod';

const emailAddress = z.string().trim().email('Enter a valid email address.').max(254).transform((email) => email.toLowerCase());
const password = z.string()
  .min(12, 'Use a password with at least 12 characters.')
  .max(128, 'Password must be 128 characters or fewer.');
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'This link is invalid or expired.');

export const accountEmailSchema = z.object({
  email: emailAddress,
}).strict();

export const accountRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: emailAddress,
}).strict();

export const accountCompletionSchema = z.object({
  token,
  password,
  confirmPassword: z.string(),
}).strict();
export const accountCompletionInputSchema = accountCompletionSchema.refine(
  (value) => value.password === value.confirmPassword,
  { path: ['confirmPassword'], message: 'Passwords do not match.' },
);

export const passwordResetSchema = z.object({
  token,
  password,
  confirmPassword: z.string(),
}).strict().refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match.',
});

export const adminPasswordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  password,
  confirmPassword: z.string(),
}).strict().refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match.',
});

export const staffOnboardingSchema = z.object({
  password,
  confirmPassword: z.string(),
  mfaCode: z.string().regex(/^\d{6}$/, 'Enter the six-digit code from your authenticator app.'),
}).strict().refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match.',
});

export type AccountRegistrationInput = z.infer<typeof accountRegistrationSchema>;
