import type { Config } from "@planetscale/database";
import type { PlanetScaleDatabase } from "drizzle-orm/planetscale-serverless";
import { drizzle } from "drizzle-orm/planetscale-serverless";
import * as schema from "./schema";

export function createDb(config: Config): PlanetScaleDatabase<typeof schema> {
  return drizzle({
    schema,
    connection: {
      host: config.host,
      username: config.username,
      password: config.password,
    },
  });
}
