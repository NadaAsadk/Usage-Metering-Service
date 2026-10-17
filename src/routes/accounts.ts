import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import { accounts, plans, planRules } from "../db/schema";
import { apiKeyAuth } from "../middleware/api-key-auth";

const router = Router();

const createAccountSchema = z.object({
  name: z.string().trim().min(2).max(100),
  planName: z.string().trim().min(1).max(100),
});

const patchAccountPlanSchema = z.object({
  planName: z.string().trim().min(1).max(100),
});

// POST /api/accounts
router.post("/", async (req, res, next) => {
  try {
    const parsed = createAccountSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
      return;
    }

    const { name, planName } = parsed.data;

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
      .where(eq(plans.name, planName))
      .limit(1);

    if (!selectedPlan || selectedPlan.scope !== "account") {
      res.status(400).json({
        error: "Account plan not found",
        message: "Choose a valid account plan, such as Starter or Growth.",
      });
      return;
    }

    // Return the API key once. Store only its SHA-256 hash.
    const apiKey = `um_live_${randomBytes(32).toString("hex")}`;
    const apiKeyHash = createHash("sha256").update(apiKey).digest("hex");

    const [account] = await db
      .insert(accounts)
      .values({
        name,
        planId: selectedPlan.id,
        apiKeyHash,
      })
      .returning({
        id: accounts.id,
        name: accounts.name,
        planId: accounts.planId,
        createdAt: accounts.createdAt,
      });

    res.status(201).json({
      message: "Account created successfully",
      account,
      plan: {
        name: selectedPlan.name,
        monthlyAllowance: selectedPlan.monthlyAllowance,
        maxUnitsPerRequest: selectedPlan.maxUnitsPerRequest,
      },
      apiKey,
      warning: "Save this API key now. It will not be returned again.",
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/accounts/plan
router.patch("/plan", apiKeyAuth, async (req, res, next) => {
  try {
    const account = req.account;
    if (!account) {
      res.status(401).json({
        error: "Unauthorized",
      });
      return;
    }
    const parsed = patchAccountPlanSchema.safeParse(req.body);
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
      .where(
        and(eq(plans.name, parsed.data.planName), eq(plans.scope, "account")),
      )
      .limit(1);

    if (!selectedPlan) {
      res.status(400).json({
        error: "Account plan not found",
        message: "Choose a valid account plan, such as Starter or Growth.",
      });
      return;
    }
    const [updatedAccount] = await db
      .update(accounts)
      .set({ planId: selectedPlan.id })
      .where(eq(accounts.id, account.id))
      .returning({
        id: accounts.id,
        name: accounts.name,
        planId: accounts.planId,
        createdAt: accounts.createdAt,
      });

    res.status(200).json({
      message: "Account plan updated successfully",
      account: updatedAccount,
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
export default router;
