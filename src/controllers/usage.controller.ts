import { NextFunction, Request, Response } from "express";
import * as usageService from "../services/usage.service";
import { findUserDetails } from "../repositories/users.repository";

export async function getAccountUsage(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const account = req.account!;

    const accountUsage = await usageService.getAccountUsage(account.id);
    res.status(200).json({
      account: {
        id: account.id,
        name: account.name,
      },
      ...accountUsage,
    });
  } catch (error) {
    next(error);
  }
}

export async function getUserUsage(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const account = req.account!;
    const userId = Number(req.params.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      res.status(400).json({ error: "Invalid user ID" });
      return;
    }

    const user = await findUserDetails(account.id, userId);

    if (!user) {
      res.status(404).json({
        error: "User not found",
        message: "The user does not belong to the authenticated account.",
      });
      return;
    }

    const getUserUsage = await usageService.getUserUsage(account.id, user.id);
    res.status(200).json({
      user: {
        id: user.id,
        externalUserId: user.externalUserId,
      },
      ...getUserUsage,
    });
  } catch (error) {
    next(error);
  }
}
