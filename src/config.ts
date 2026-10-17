import "dotenv/config";

export function readConfig() {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    throw new Error("DATABASE_URL is required");
  }

  return {
    dbUrl,
    port: Number(process.env.PORT ?? 3000),
  };
}
