import { Router } from "express";

import {
  consumeUnits,
  getConsumptions,
} from "../controllers/consumptions.controller";

const router = Router();

// POST /api/consumptions
router.post("/", consumeUnits);

// GET /api/consumptions
router.get("/", getConsumptions);

export default router;
