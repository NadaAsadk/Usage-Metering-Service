import { Router } from "express";

import { apiKeyAuth } from "../middleware/api-key-auth";
import {
  createPlan,
  getAllPlans,
  getMyPlan,
  getMyPlans,
  getPlan,
  updatePlan,
} from "../controllers/plans.controller";

const router = Router();

// GET /api/plans
router.get("/", getAllPlans);

// GET /api/plans/mine
router.get("/mine", apiKeyAuth, getMyPlans);

// GET /api/plans/mine/:id
router.get("/mine/:id", apiKeyAuth, getMyPlan);

// GET /api/plans/:id
router.get("/:id", getPlan);

// POST /api/plans
router.post("/", apiKeyAuth, createPlan);

// PATCH /api/plans/:id
router.patch("/:id", apiKeyAuth, updatePlan);

export default router;
