ALTER TABLE "tables" ADD COLUMN "qr_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_paid_at_idx" ON "orders" USING btree ("paid_at");