import { config } from "dotenv";
import type { Config } from "drizzle-kit";
import { defineConfig } from "drizzle-kit";

config({ path: ".env" });

export default defineConfig({
  out: "./drizzle",
  schema: "./src/schema.ts",
  dialect: "mysql",
  dbCredentials: {
    url: `mysql://${process.env.DATABASE_USERNAME}:${process.env.DATABASE_PASSWORD}@${process.env.DATABASE_HOST}/cannon?ssl={"rejectUnauthorized":true}`,
  },
} satisfies Config);
