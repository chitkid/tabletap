import { z } from 'zod';
import { StaffRoleSchema } from './roles';

export const StaffPrincipalSchema = z.object({
  kind: z.literal('staff'),
  userId: z.string().min(1),
  email: z.string(),
  name: z.string(),
  role: StaffRoleSchema,
});
export const GuestPrincipalSchema = z.object({
  kind: z.literal('guest'),
  guestSessionId: z.uuid(),
  tableId: z.uuid(),
  tableNumber: z.number().int().positive(),
  expiresAt: z.iso.datetime(),
});
export const AnonymousPrincipalSchema = z.object({ kind: z.literal('anonymous') });
export const PrincipalSchema = z.discriminatedUnion('kind', [StaffPrincipalSchema, GuestPrincipalSchema, AnonymousPrincipalSchema]);
export type StaffPrincipal = z.infer<typeof StaffPrincipalSchema>;
export type GuestPrincipal = z.infer<typeof GuestPrincipalSchema>;
export type Principal = z.infer<typeof PrincipalSchema>;
