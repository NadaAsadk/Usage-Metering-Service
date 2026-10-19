import {
  pgTable,
  pgEnum,
  serial,
  integer,
  bigint,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  jsonb,
  unique,
  uniqueIndex,
  index,
  check,
  foreignKey,
  AnyPgColumn,
} from "drizzle-orm/pg-core";

import { relations, sql } from "drizzle-orm";

export const planScopeEnum = pgEnum("plan_scope", ["account", "user"]);

export const consumptionStatusEnum = pgEnum("consumption_status", [
  "accepted",
  "rejected",
]);

export const rejectionScopeEnum = pgEnum("rejection_scope", [
  "account",
  "user",
  "request",
]);

export const plans = pgTable(
  "plans",
  {
    id: serial("id").primaryKey(),

    name: varchar("name", { length: 100 }).notNull(),

    scope: planScopeEnum("scope").notNull(),

    isPredefined: boolean("is_predefined").notNull().default(false),

    ownerAccountId: integer("owner_account_id").references(
      (): AnyPgColumn => accounts.id,
      {
        onDelete: "restrict",
      },
    ),
    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_plans_shared_scope_name")
      .on(table.scope, table.name)
      .where(sql`${table.ownerAccountId} IS NULL`),
    uniqueIndex("uq_plans_owner_scope_name")
      .on(table.ownerAccountId, table.scope, table.name)
      .where(sql`${table.ownerAccountId} IS NOT NULL`),
  ],
);

export const planRules = pgTable("plan_rules", {
  planId: integer("plan_id")
    .primaryKey()
    .references(() => plans.id, { onDelete: "restrict" }),

  monthlyAllowance: bigint("monthly_allowance", {
    mode: "number",
  })
    .notNull()
    .$type<number>(),

  maxUnitsPerRequest: bigint("max_units_per_request", {
    mode: "number",
  })
    .notNull()
    .$type<number>(),
});

export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),

  name: varchar("name", { length: 200 }).notNull(),

  apiKeyHash: text("api_key_hash").notNull().unique(),

  planId: integer("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "restrict" }),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  })
    .notNull()
    .defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),

    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),

    externalUserId: varchar("external_user_id", {
      length: 255,
    }).notNull(),

    planId: integer("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("uq_users_account_external").on(
      table.accountId,
      table.externalUserId,
    ),

    unique("uq_users_id_account").on(table.id, table.accountId),
  ],
);

export const usageCounters = pgTable(
  "usage_counters",
  {
    id: serial("id").primaryKey(),

    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),

    userId: integer("user_id"),

    periodStart: date("period_start", {
      mode: "string",
    }).notNull(),

    consumedUnits: bigint("consumed_units", {
      mode: "number",
    })
      .notNull()
      .default(0)
      .$type<number>(),

    updatedAt: timestamp("updated_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("chk_usage_nonnegative", sql`${table.consumedUnits} >= 0`),

    check(
      "chk_usage_month_start",
      sql`EXTRACT(DAY FROM ${table.periodStart}::date) = 1`,
    ),

    foreignKey({
      name: "fk_usage_user_account",
      columns: [table.userId, table.accountId],
      foreignColumns: [users.id, users.accountId],
    }).onDelete("restrict"),

    uniqueIndex("uq_usage_account_month")
      .on(table.accountId, table.periodStart)
      .where(sql`${table.userId} IS NULL`),

    uniqueIndex("uq_usage_user_month")
      .on(table.userId, table.periodStart)
      .where(sql`${table.userId} IS NOT NULL`),
  ],
);

export type PlanSnapshot = {
  planId: number;
  name: string;
  scope: "account" | "user";
  monthlyAllowance: number;
  maxUnitsPerRequest: number;
};

export const consumptionRequests = pgTable(
  "consumption_requests",
  {
    id: serial("id").primaryKey(),

    accountId: integer("account_id").notNull(),

    userId: integer("user_id").notNull(),

    requestId: varchar("request_id", {
      length: 255,
    }).notNull(),

    units: bigint("units", { mode: "number" }).notNull().$type<number>(),

    status: consumptionStatusEnum("status").notNull(),

    rejectionScope: rejectionScopeEnum("rejection_scope"),

    rejectionReason: text("rejection_reason"),

    accountPlanSnapshot: jsonb("account_plan_snapshot")
      .$type<PlanSnapshot>()
      .notNull(),

    userPlanSnapshot: jsonb("user_plan_snapshot")
      .$type<PlanSnapshot>()
      .notNull(),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("chk_request_positive_units", sql`${table.units} > 0`),

    check(
      "chk_request_result",
      sql`(
        (
          ${table.status} = 'accepted'
          AND ${table.rejectionScope} IS NULL
          AND ${table.rejectionReason} IS NULL
        )
        OR
        (
          ${table.status} = 'rejected'
          AND ${table.rejectionScope} IS NOT NULL
          AND ${table.rejectionReason} IS NOT NULL
        )
      )`,
    ),

    foreignKey({
      name: "fk_requests_user_account",
      columns: [table.userId, table.accountId],
      foreignColumns: [users.id, users.accountId],
    }).onDelete("restrict"),

    unique("uq_requests_account_request").on(table.accountId, table.requestId),

    index("idx_requests_account_created").on(table.accountId, table.createdAt),

    index("idx_requests_user_created").on(table.userId, table.createdAt),
  ],
);

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  plan: one(plans, {
    fields: [accounts.planId],
    references: [plans.id],
  }),

  users: many(users),
  usageCounters: many(usageCounters),
  consumptionRequests: many(consumptionRequests),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  account: one(accounts, {
    fields: [users.accountId],
    references: [accounts.id],
  }),

  plan: one(plans, {
    fields: [users.planId],
    references: [plans.id],
  }),

  usageCounters: many(usageCounters),
  consumptionRequests: many(consumptionRequests),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  accounts: many(accounts),
  users: many(users),
  rules: many(planRules),
}));

export const planRulesRelations = relations(planRules, ({ one }) => ({
  plan: one(plans, {
    fields: [planRules.planId],
    references: [plans.id],
  }),
}));

export const usageCountersRelations = relations(usageCounters, ({ one }) => ({
  account: one(accounts, {
    fields: [usageCounters.accountId],
    references: [accounts.id],
  }),

  user: one(users, {
    fields: [usageCounters.userId],
    references: [users.id],
  }),
}));

export const consumptionRequestsRelations = relations(
  consumptionRequests,
  ({ one }) => ({
    account: one(accounts, {
      fields: [consumptionRequests.accountId],
      references: [accounts.id],
    }),

    user: one(users, {
      fields: [consumptionRequests.userId],
      references: [users.id],
    }),
  }),
);

export type Plan = typeof plans.$inferSelect;
export type NewPlan = typeof plans.$inferInsert;

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type UsageCounter = typeof usageCounters.$inferSelect;
export type ConsumptionRequest = typeof consumptionRequests.$inferSelect;
