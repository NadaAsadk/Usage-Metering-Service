import { NextFunction, Request, Response } from "express";
import * as plansService from "../services/plans.service";
import { patchPlanSchema, planSchema } from "../validators/plans.validator";
function parsePlanId(rawId: number): number | null {
  const id = Number(rawId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function getAllPlans(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const plans = await plansService.getAllPlans();
    res.status(200).json({ plans });
  } catch (error) {
    next(error);
  }
}
export async function getMyPlans(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const plans = await plansService.getAllPlans(req.account!.id);
    res.status(200).json({ plans });
  } catch (error) {
    next(error);
  }
}
export async function getMyPlan(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const id = parsePlanId(Number(req.params.id));
  if (id === null) {
    res.status(400).json({ error: "Invalid plan ID" });
    return;
  }
  try {
    const plan = await plansService.getPlan(id, req.account!.id);
    res.status(200).json({ plan });
  } catch (error) {
    next(error);
  }
}
export async function getPlan(req: Request, res: Response, next: NextFunction) {
  const id = parsePlanId(Number(req.params.id));
  if (id === null) {
    res.status(400).json({ error: "Invalid plan ID" });
    return;
  }
  try {
    const plan = await plansService.getPlan(id);
    res.status(200).json({ plan });
  } catch (error) {
    next(error);
  }
}

export async function createPlan(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.issues,
    });
    return;
  }
  try {
    const plan = await plansService.createPlan(req.account!.id, parsed.data);
    res.status(201).json({
      message: "Custom plan created successfully",
      plan,
    });
  } catch (error) {
    next(error);
  }
}

export async function updatePlan(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const id = parsePlanId(Number(req.params.id));
  if (id === null) {
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
  try {
    const plan = await plansService.updatePlan(
      id,
      req.account!.id,
      parsed.data,
    );
    res.status(200).json({
      message: "Plan updated successfully",
      plan,
    });
  } catch (error) {
    next(error);
  }
}
