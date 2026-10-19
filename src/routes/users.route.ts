import { Router } from "express";

import {
  changeUserPlan,
  createUser,
  getUser,
} from "../controllers/users.controller";

const router = Router();

// POST /api/users
router.post("/", createUser);

// PATCH /api/users/:id/plan
router.patch("/:id/plan", changeUserPlan);

// GET /api/users/:id
router.get("/:id", getUser);

export default router;
