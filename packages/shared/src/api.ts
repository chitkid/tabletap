import { z } from 'zod';
import { AllergenSchema } from './menu';
import { OrderStatusSchema } from './orders';
import { PrincipalSchema } from './principal';
import { StaffRoleSchema } from './roles';

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

export const MenuItemDtoSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  name: z.string().min(1),
  description: z.string(),
  priceCents: z.number().int().nonnegative(),
  allergens: z.array(AllergenSchema),
  isAvailable: z.boolean(),
  imageUrl: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type MenuItemDto = z.infer<typeof MenuItemDtoSchema>;
export const MenuCategoryDtoSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  sortOrder: z.number().int(),
  items: z.array(MenuItemDtoSchema),
});
export type MenuCategoryDto = z.infer<typeof MenuCategoryDtoSchema>;
export const MenuResponseSchema = z.object({
  restaurant: z.object({ id: z.uuid(), name: z.string().min(1), currency: z.string().length(3) }),
  categories: z.array(MenuCategoryDtoSchema),
});
export type MenuResponse = z.infer<typeof MenuResponseSchema>;

export const OrderCreateItemSchema = z.object({
  menuItemId: z.uuid(),
  quantity: z.number().int().min(1).max(20),
});
export const OrderCreateRequestSchema = z.object({
  items: z
    .array(OrderCreateItemSchema)
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((i) => i.menuItemId)).size === items.length, {
      message: 'Each menu item may appear once.',
    }),
  note: z.string().trim().max(280).optional(),
});
export type OrderCreateRequest = z.infer<typeof OrderCreateRequestSchema>;

export const OrderItemDtoSchema = z.object({
  id: z.uuid(),
  menuItemId: z.uuid(),
  name: z.string().min(1),
  unitPriceCents: z.number().int().nonnegative(),
  quantity: z.number().int().positive(),
  lineTotalCents: z.number().int().nonnegative(),
});
export type OrderItemDto = z.infer<typeof OrderItemDtoSchema>;
export const OrderDtoSchema = z.object({
  id: z.uuid(),
  number: z.number().int().positive(),
  status: OrderStatusSchema,
  tableId: z.uuid(),
  tableNumber: z.number().int().positive(),
  items: z.array(OrderItemDtoSchema),
  subtotalCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
  note: z.string().nullable(),
  placedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type OrderDto = z.infer<typeof OrderDtoSchema>;
export const OrderResponseSchema = z.object({ order: OrderDtoSchema });
export const OrdersResponseSchema = z.object({ orders: z.array(OrderDtoSchema) });

export const DemoLinksResponseSchema = z.object({
  guest: z.object({ tableNumber: z.number().int().positive(), url: z.url() }),
  staff: z.array(
    z.object({
      role: StaffRoleSchema,
      email: z.email(),
      name: z.string().min(1),
      password: z.string().min(1),
    }),
  ),
  resetsEveryMinutes: z.number().int().nonnegative().nullable(),
});
export type DemoLinksResponse = z.infer<typeof DemoLinksResponseSchema>;

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const IdempotencyKeySchema = z.uuid();
