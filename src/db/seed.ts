import { and, eq } from "drizzle-orm";

import { conn, db } from "./index";
import { plans, planRules } from "./schema";

const predefinedPlans = [
  {
    name: "Starter",
    scope: "account" as const,
    monthlyAllowance: 10_000,
    maxUnitsPerRequest: 1_000,
  },
  {
    name: "Growth",
    scope: "account" as const,
    monthlyAllowance: 100_000,
    maxUnitsPerRequest: 10_000,
  },
  {
    name: "Basic",
    scope: "user" as const,
    monthlyAllowance: 1_000,
    maxUnitsPerRequest: 250,
  },
  {
    name: "Power",
    scope: "user" as const,
    monthlyAllowance: 10_000,
    maxUnitsPerRequest: 2_500,
  },
];

async function main() {
  try {
    await db.transaction(async (tx) => {
      for (const item of predefinedPlans) {
        const existingPlans = await tx
          .select({
            id: plans.id,
            isPredefined: plans.isPredefined,
          })
          .from(plans)
          .where(and(eq(plans.name, item.name), eq(plans.scope, item.scope)))
          .limit(1);

        let planId: number;

        if (existingPlans.length > 0) {
          const existing = existingPlans[0];

          if (!existing.isPredefined) {
            throw new Error(
              `Cannot seed "${item.name}": a custom plan already uses this name and scope.`,
            );
          }

          planId = existing.id;
        } else {
          const [createdPlan] = await tx
            .insert(plans)
            .values({
              name: item.name,
              scope: item.scope,
              isPredefined: true,
            })
            .returning({ id: plans.id });

          planId = createdPlan.id;
        }

        await tx
          .insert(planRules)
          .values({
            planId,
            monthlyAllowance: item.monthlyAllowance,
            maxUnitsPerRequest: item.maxUnitsPerRequest,
          })
          .onConflictDoUpdate({
            target: planRules.planId,
            set: {
              monthlyAllowance: item.monthlyAllowance,
              maxUnitsPerRequest: item.maxUnitsPerRequest,
            },
          });
      }
    });

    console.log("Predefined plans seeded successfully.");
  } catch (error) {
    console.error("Failed to seed predefined plans:", error);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

void main();
