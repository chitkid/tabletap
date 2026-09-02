import { z } from 'zod';
import { PrincipalSchema } from './principal';

export const ClaimRequestSchema = z.object({ token: z.string().min(1) });
export type ClaimRequest = z.infer<typeof ClaimRequestSchema>;

export const TableDtoSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  label: z.string().min(1),
  seats: z.number().int().positive(),
  isActive: z.boolean(),
});
export type TableDto = z.infer<typeof TableDtoSchema>;

export const ClaimResponseSchema = z.object({
  table: TableDtoSchema.pick({ id: true, number: true, label: true }),
  expiresAt: z.iso.datetime(),
});
export type ClaimResponse = z.infer<typeof ClaimResponseSchema>;

export const MeResponseSchema = z.object({ principal: PrincipalSchema });
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const TablesResponseSchema = z.object({ tables: z.array(TableDtoSchema) });
export const TableResponseSchema = z.object({ table: TableDtoSchema });

export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptime: z.number(),
  checks: z.object({ db: z.enum(['ok', 'fail']) }),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
