import { Router } from "express";
import { getAccountUsage, getUserUsage } from "../controllers/usage.controller";

const router = Router();

// GET /api/usage/account
router.get("/account", getAccountUsage);

// GET /api/usage/users/:id
router.get("/users/:id", getUserUsage);

export default router;
