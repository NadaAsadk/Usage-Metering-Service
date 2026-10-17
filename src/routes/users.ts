import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";

import { db } from "../db";
import { plans, planRules, users } from "../db/schema";

const router = Router();

const createUserSchema = z.object({
  externalUserId: z.string().trim().min(1).max(255),
  planName: z.string().trim().min(1).max(100),
});
const patchUserPlanSchema = z.object({
  planName: z.string().trim().min(1).max(100),
});

// POST /api/users
router.post("/", async (req, res, next) => {
  try {
    const account = req.account;

    // This route must be protected by apiKeyAuth.
    if (!account) {
      res.status(401).json({
        error: "Unauthorized",
        message: "A valid API key is required.",
      });
      return;
    }

    const parsed = createUserSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
      return;
    }

    const { externalUserId, planName } = parsed.data;

    const [selectedPlan] = await db
      .select({
        id: plans.id,
        name: plans.name,
        scope: plans.scope,
        monthlyAllowance: planRules.monthlyAllowance,
        maxUnitsPerRequest: planRules.maxUnitsPerRequest,
      })
      .from(plans)
      .innerJoin(planRules, eq(plans.id, planRules.planId))
      .where(and(eq(plans.name, planName), eq(plans.scope, "user")))
      .limit(1);

    if (!selectedPlan) {
      res.status(400).json({
        error: "User plan not found",
        message: "Choose a valid user plan, such as Basic or Power.",
      });
      return;
    }

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.accountId, account.id),
          eq(users.externalUserId, externalUserId),
        ),
      )
      .limit(1);

    if (existingUser) {
      res.status(409).json({
        error: "User already exists",
        message:
          "This external user ID is already registered for this account.",
      });
      return;
    }

    const [createdUser] = await db
      .insert(users)
      .values({
        accountId: account.id,
        externalUserId,
        planId: selectedPlan.id,
      })
      .returning({
        id: users.id,
        externalUserId: users.externalUserId,
        planId: users.planId,
        createdAt: users.createdAt,
      });

    res.status(201).json({
      message: "User created successfully",
      user: createdUser,
      plan: {
        name: selectedPlan.name,
        monthlyAllowance: selectedPlan.monthlyAllowance,
        maxUnitsPerRequest: selectedPlan.maxUnitsPerRequest,
      },
    });
  } catch (error) {
    // PostgreSQL unique-constraint violation.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({
        error: "User already exists",
        message:
          "This external user ID is already registered for this account.",
      });
      return;
    }

    next(error);
  }
});

// PATCH /api/users/:id/plan
router.patch("/:id/plan", async (req, res, next) => {
  try {
    const account = req.account;
    const userId = Number(req.params.id);
    if (!account) {
      res.status(401).json({
        error: "Unauthorized",
      });
      return;
    }
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      res.status(400).json({
        error: "Invalid user ID",
      });
      return;
    }
    const parsed = patchUserPlanSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
      return;
    }
    const [selectedPlan] = await db
      .select({
        id: plans.id,
        name: plans.name,
        scope: plans.scope,
        monthlyAllowance: planRules.monthlyAllowance,
        maxUnitsPerRequest: planRules.maxUnitsPerRequest,
      })
      .from(plans)
      .innerJoin(planRules, eq(plans.id, planRules.planId))
      .where(and(eq(plans.name, parsed.data.planName), eq(plans.scope, "user")))
      .limit(1);
    if (!selectedPlan) {
      res.status(400).json({
        error: "User plan not found",
        message: "Choose a valid user plan, such as Basic or Power.",
      });
      return;
    }
    const [updatedUser] = await db
      .update(users)
      .set({ planId: selectedPlan.id })
      .where(and(eq(users.id, userId), eq(users.accountId, account.id)))
      .returning({
        id: users.id,
        externalUserId: users.externalUserId,
        accountId: users.accountId,
        planId: users.planId,
      });
    if (!updatedUser) {
      res.status(404).json({
        error: "User not found",
      });
      return;
    }
    res.status(200).json({
      message: "User plan updated successfully",
      user: updatedUser,
      plan: {
        name: selectedPlan.name,
        monthlyAllowance: selectedPlan.monthlyAllowance,
        maxUnitsPerRequest: selectedPlan.maxUnitsPerRequest,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:id
router.get("/:id", async (req, res, next) => {
  try {
    const account = req.account;
    const userId = Number(req.params.id);
    if (!account) {
      res.status(401).json({
        error: "Unauthorized",
      });
      return;
    }
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      res.status(400).json({
        error: "Invalid user ID",
      });
      return;
    }
    const [result] = await db
      .select({
        id: users.id,
        externalUserId: users.externalUserId,
        accountId: users.accountId,
        planId: users.planId,
        createdAt: users.createdAt,
        monthlyAllowance: planRules.monthlyAllowance,
        maxUnitsPerRequest: planRules.maxUnitsPerRequest,
      })
      .from(users)
      .innerJoin(plans, eq(users.planId, plans.id))
      .innerJoin(planRules, eq(plans.id, planRules.planId))
      .where(and(eq(users.id, userId), eq(users.accountId, account.id)))
      .limit(1);

    if (!result) {
      res.status(404).json({
        error: "User not Found",
      });
      return;
    }
    res.status(200).json({ user: result });
  } catch (error) {
    next(error);
  }
});

export default router;
