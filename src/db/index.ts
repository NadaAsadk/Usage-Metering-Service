import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";
import { readConfig } from "../config/env";

const config = readConfig();

export const conn = postgres(config.databaseUrl);
export const db = drizzle(conn, { schema });
