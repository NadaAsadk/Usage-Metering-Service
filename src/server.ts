import app from "./app";
import { readConfig } from "./config/env";

const config = readConfig();

const server = app.listen(config.port, () => {
  console.log(`Usage Metering API listening on port ${config.port}`);
});

function shutdown(signal: string) {
  console.log(`${signal} received. Closing server...`);

  server.close(async (error) => {
    if (error) {
      console.error("Failed to close HTTP server:", error);
      process.exitCode = 1;
    }
    try {
      const { conn } = await import("./db/index.js");
      await conn.end();
    } catch (shutdownError) {
      console.error("Failed to close database connection:", shutdownError);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
