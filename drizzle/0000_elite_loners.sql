CREATE TYPE "public"."consumption_status" AS ENUM('accepted', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."plan_scope" AS ENUM('account', 'user');--> statement-breakpoint
CREATE TYPE "public"."rejection_scope" AS ENUM('account', 'user', 'request');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"api_key_hash" text NOT NULL,
	"plan_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "consumption_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"request_id" varchar(255) NOT NULL,
	"units" bigint NOT NULL,
	"status" "consumption_status" NOT NULL,
	"rejection_scope" "rejection_scope",
	"rejection_reason" text,
	"account_plan_snapshot" jsonb NOT NULL,
	"user_plan_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_requests_account_request" UNIQUE("account_id","request_id"),
	CONSTRAINT "chk_request_positive_units" CHECK ("consumption_requests"."units" > 0),
	CONSTRAINT "chk_request_result" CHECK ((
        (
          "consumption_requests"."status" = 'accepted'
          AND "consumption_requests"."rejection_scope" IS NULL
          AND "consumption_requests"."rejection_reason" IS NULL
        )
        OR
        (
          "consumption_requests"."status" = 'rejected'
          AND "consumption_requests"."rejection_scope" IS NOT NULL
          AND "consumption_requests"."rejection_reason" IS NOT NULL
        )
      ))
);
--> statement-breakpoint
CREATE TABLE "plan_rules" (
	"plan_id" integer PRIMARY KEY NOT NULL,
	"monthly_allowance" bigint NOT NULL,
	"max_units_per_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"scope" "plan_scope" NOT NULL,
	"is_predefined" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_plans_scope_name" UNIQUE("scope","name")
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"user_id" integer,
	"period_start" date NOT NULL,
	"consumed_units" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_usage_nonnegative" CHECK ("usage_counters"."consumed_units" >= 0),
	CONSTRAINT "chk_usage_month_start" CHECK (EXTRACT(DAY FROM "usage_counters"."period_start"::date) = 1)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"external_user_id" varchar(255) NOT NULL,
	"plan_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_users_account_external" UNIQUE("account_id","external_user_id"),
	CONSTRAINT "uq_users_id_account" UNIQUE("id","account_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consumption_requests" ADD CONSTRAINT "fk_requests_user_account" FOREIGN KEY ("user_id","account_id") REFERENCES "public"."users"("id","account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_rules" ADD CONSTRAINT "plan_rules_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "fk_usage_user_account" FOREIGN KEY ("user_id","account_id") REFERENCES "public"."users"("id","account_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_requests_account_created" ON "consumption_requests" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_requests_user_created" ON "consumption_requests" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_usage_account_month" ON "usage_counters" USING btree ("account_id","period_start") WHERE "usage_counters"."user_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_usage_user_month" ON "usage_counters" USING btree ("user_id","period_start") WHERE "usage_counters"."user_id" IS NOT NULL;