import express from "express";

import accountsRouter from "./routes/accounts.route";
import usersRouter from "./routes/users.route";
import plansRouter from "./routes/plans.route";
import consumptionsRouter from "./routes/consumptions.route";
import usageRouter from "./routes/usage.route";

import { apiKeyAuth } from "./middleware/api-key-auth";
import { errorHandler } from "./middleware/error-handler";

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

app.use(errorHandler);

export default app;
