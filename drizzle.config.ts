import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: ["./db/schema.ts", "./db/sla-schema.ts", "./db/profitability-schema.ts"],
  dialect: "sqlite",
});
