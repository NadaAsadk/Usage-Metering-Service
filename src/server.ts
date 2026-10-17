import dotenv from "dotenv";

dotenv.config();

import express from "express";

import accountsRouter from "./routes/accounts";
import usersRouter from "./routes/users";
import plansRouter from "./routes/plans";
import consumptionsRouter from "./routes/consumptions";
import usageRouter from "./routes/usage";

import { apiKeyAuth } from "./middleware/api-key-auth";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "usage-metering",
  });
});

app.use("/api/accounts", accountsRouter);
app.use("/api/users", apiKeyAuth, usersRouter);
app.use("/api/plans", plansRouter);
app.use("/api/consumptions", apiKeyAuth, consumptionsRouter);
app.use("/api/usage", apiKeyAuth, usageRouter);

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`Usage Metering API listening on port ${port}`);
});
