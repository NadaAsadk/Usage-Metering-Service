ALTER TABLE "plans" DROP CONSTRAINT "uq_plans_scope_name";--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "owner_account_id" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_plans_shared_scope_name" ON "plans" USING btree ("scope","name") WHERE "plans"."owner_account_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_plans_owner_scope_name" ON "plans" USING btree ("owner_account_id","scope","name") WHERE "plans"."owner_account_id" IS NOT NULL;