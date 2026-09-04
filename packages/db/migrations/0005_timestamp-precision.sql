ALTER TABLE "restaurants" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "restaurants" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "restaurants" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "restaurants" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "tables" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "tables" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "tables" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "tables" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "menu_categories" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "menu_categories" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "menu_categories" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "menu_categories" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "menu_items" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "menu_items" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "menu_items" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "menu_items" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "guest_sessions" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "guest_sessions" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "guest_sessions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "guest_sessions" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "updated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "created_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "updated_at" SET DEFAULT now();