import { createHash } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";

import { db } from "../db";
import { accounts } from "../db/schema";

export type AuthenticatedAccount = {
  id: number;
  name: string;
};

declare global {
  namespace Express {
    interface Request {
      account?: AuthenticatedAccount;
    }
  }
}

export async function apiKeyAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const authorization = req.header("Authorization");
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);
    const apiKey = match?.[1];

    if (!apiKey) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Provide an API key using Authorization: Bearer <API_KEY>.",
      });
      return;
    }

    const apiKeyHash = createHash("sha256").update(apiKey).digest("hex");

    const [account] = await db
      .select({
        id: accounts.id,
        name: accounts.name,
      })
      .from(accounts)
      .where(eq(accounts.apiKeyHash, apiKeyHash))
      .limit(1);

    if (!account) {
      res.status(401).json({
        error: "Unauthorized",
        message: "Invalid API key.",
      });
      return;
    }

    req.account = account;
    next();
  } catch (error) {
    next(error);
  }
}
