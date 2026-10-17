import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { db } from "../db";
import { plans, planRules } from "../db/schema";
import { apiKeyAuth } from "../middleware/api-key-auth";

const router = Router();

const planSchema = z.object({
  name: z.string().trim().min(2).max(100),
  scope: z.enum(["account", "user"]),
  monthlyAllowance: z.number().int().nonnegative(),
  maxUnitsPerRequest: z.number().int().positive(),
});

const patchPlanSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    monthlyAllowance: z.number().int().nonnegative().optional(),
    maxUnitsPerRequest: z.number().int().positive().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update.",
  });

// GET /api/plans
// GET /api/plans/:id
router.get("/", async (_req, res, next) => {
  try {
    const result = await db
      .select({
        id: plans.id,
        name: plans.name,
        scope: plans.scope,
        isPredefined: plans.isPredefined,
        monthlyAllowance: planRules.monthlyAllowance,
        maxUnitsPerRequest: planRules.maxUnitsPerRequest,
        createdAt: plans.createdAt,
      })
      .from(plans)
      .innerJoin(planRules, eq(plans.id, planRules.planId))
      .orderBy(plans.scope, plans.id);

    res.status(200).json({ plans: result });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid plan ID" });
      return;
    }

    const [plan] = await db
      .select({
        id: plans.id,
        name: plans.name,
        scope: plans.scope,
        isPredefined: plans.isPredefined,
        monthlyAllowance: planRules.monthlyAllowance,
        maxUnitsPerRequest: planRules.maxUnitsPerRequest,
        createdAt: plans.createdAt,
      })
      .from(plans)
      .innerJoin(planRules, eq(plans.id, planRules.planId))
      .where(eq(plans.id, id))
      .limit(1);

    if (!plan) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    res.status(200).json({ plan });
  } catch (error) {
    next(error);
  }
});

// POST /api/plans
router.post("/", apiKeyAuth, async (req, res, next) => {
  try {
    const parsed = planSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
      return;
    }

    const data = parsed.data;

    const [existing] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(and(eq(plans.name, data.name), eq(plans.scope, data.scope)))
      .limit(1);

    if (existing) {
      res.status(409).json({
        error: "Plan already exists",
        message: "A plan with this name and scope already exists.",
      });
      return;
    }

    const createdPlan = await db.transaction(async (tx) => {
      const [plan] = await tx
        .insert(plans)
        .values({
          name: data.name,
          scope: data.scope,
          isPredefined: false,
        })
        .returning({
          id: plans.id,
          name: plans.name,
          scope: plans.scope,
          isPredefined: plans.isPredefined,
          createdAt: plans.createdAt,
        });

      const [rule] = await tx
        .insert(planRules)
        .values({
          planId: plan.id,
          monthlyAllowance: data.monthlyAllowance,
          maxUnitsPerRequest: data.maxUnitsPerRequest,
        })
        .returning({
          monthlyAllowance: planRules.monthlyAllowance,
          maxUnitsPerRequest: planRules.maxUnitsPerRequest,
        });

      return { ...plan, ...rule };
    });

    res.status(201).json({
      message: "Custom plan created successfully",
      plan: createdPlan,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({ error: "Plan already exists" });
      return;
    }

    next(error);
  }
});

// PATCH /api/plans/:id
router.patch("/:id", apiKeyAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isSafeInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid plan ID" });
      return;
    }

    const parsed = patchPlanSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
      return;
    }

    const changes = parsed.data;

    const [existing] = await db
      .select({
        id: plans.id,
        isPredefined: plans.isPredefined,
      })
      .from(plans)
      .where(eq(plans.id, id))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Plan not found" });
      return;
    }

    if (existing.isPredefined) {
      res.status(403).json({
        error: "Predefined plans cannot be modified.",
      });
      return;
    }

    const updatedPlan = await db.transaction(async (tx) => {
      if (changes.name !== undefined) {
        await tx
          .update(plans)
          .set({ name: changes.name })
          .where(eq(plans.id, id));
      }

      const ruleChanges: {
        monthlyAllowance?: number;
        maxUnitsPerRequest?: number;
      } = {};

      if (changes.monthlyAllowance !== undefined) {
        ruleChanges.monthlyAllowance = changes.monthlyAllowance;
      }

      if (changes.maxUnitsPerRequest !== undefined) {
        ruleChanges.maxUnitsPerRequest = changes.maxUnitsPerRequest;
      }

      if (Object.keys(ruleChanges).length > 0) {
        await tx
          .update(planRules)
          .set(ruleChanges)
          .where(eq(planRules.planId, id));
      }

      const [plan] = await tx
        .select({
          id: plans.id,
          name: plans.name,
          scope: plans.scope,
          isPredefined: plans.isPredefined,
          monthlyAllowance: planRules.monthlyAllowance,
          maxUnitsPerRequest: planRules.maxUnitsPerRequest,
          createdAt: plans.createdAt,
        })
        .from(plans)
        .innerJoin(planRules, eq(plans.id, planRules.planId))
        .where(eq(plans.id, id))
        .limit(1);

      return plan;
    });

    res.status(200).json({
      message: "Plan updated successfully",
      plan: updatedPlan,
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({
        error: "Plan name already exists for this scope.",
      });
      return;
    }

    next(error);
  }
});

export default router;
