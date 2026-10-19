import { NextFunction, Request, Response } from "express";
import {
  consumeSchema,
  consumptionQuerySchema,
} from "../validators/consumptions.validator";
import * as consumptionsService from "../services/consumptions.service";

export async function consumeUnits(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const account = req.account!;
    const parsed = consumeSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid request body",
        details: parsed.error.issues,
      });
      return;
    }
    const { userId, requestId, units } = parsed.data;
    const decision = await consumptionsService.consume(
      account.id,
      userId,
      requestId,
      units,
    );

    res.status(decision.statusCode).json(decision.body);
  } catch (error) {
    next(error);
  }
}

export async function getConsumptions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const account = req.account!;
  const parsed = consumptionQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    res.status(400).json({
      error: "Invalid query parameters",
      details: parsed.error.issues,
    });
    return;
  }

  try {
    const result = await consumptionsService.getConsumptions(
      account.id,
      parsed.data,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}
