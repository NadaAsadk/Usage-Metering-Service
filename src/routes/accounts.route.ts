import { Router } from "express";

import { apiKeyAuth } from "../middleware/api-key-auth";
import {
  changeAccountPlan,
  createAccount,
} from "../controllers/accounts.controller";

const router = Router();

// POST /api/accounts
router.post("/", createAccount);

// PATCH /api/accounts/plan
router.patch("/plan", apiKeyAuth, changeAccountPlan);

export default router;
