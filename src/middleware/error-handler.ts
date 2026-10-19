import { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (
    error instanceof Error &&
    "statusCode" in error &&
    typeof error.statusCode === "number" &&
    error.statusCode >= 400 &&
    error.statusCode < 500
  ) {
    const details =
      "details" in error && typeof error.details === "string"
        ? error.details
        : undefined;
    res.status(error.statusCode).json({
      error: error.message,
      ...(details ? { message: details } : {}),
    });
    return;
  }
  console.error("Unhandled application error:", error);

  res.status(500).json({
    error: "Internal server error",
  });
};
