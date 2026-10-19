import { NextFunction, Request, Response } from "express";
import {
  createUserSchema,
  patchUserPlanSchema,
} from "../validators/users.validator";
import * as usersService from "../services/users.service";

function parseUserId(rawId: number): number | null {
  const id = Number(rawId);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function createUser(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const account = req.account!;
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid request body",
      details: parsed.error.issues,
    });
    return;
  }
  try {
    const { externalUserId, planName } = parsed.data;
    const result = await usersService.createUser(
      account.id,
      externalUserId,
      planName,
    );
    res.status(201).json({
      message: "User created successfully",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}

export async function changeUserPlan(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const account = req.account!;
  const userId = parseUserId(Number(req.params.id));
  if (userId === null) {
    res.status(400).json({ error: "Invalid user ID" });
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

  try {
    const { planName } = parsed.data;
    const result = await usersService.changeUserPlan(
      account.id,
      userId,
      planName,
    );
    res.status(200).json({
      message: "User plan updated successfully",
      ...result,
    });
  } catch (error) {
    next(error);
  }
}
export async function getUser(req: Request, res: Response, next: NextFunction) {
  const account = req.account!;
  const userId = parseUserId(Number(req.params.id));
  if (userId === null) {
    res.status(400).json({ error: "Invalid user ID" });
    return;
  }
  try {
    const user = await usersService.getUser(account.id, userId);
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
}
