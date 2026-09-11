import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: [
    "./db/schema.ts",
    "./db/sla-schema.ts",
    "./db/profitability-schema.ts",
    "./db/goal-scope-schema.ts",
    "./db/treasury-schema.ts",
    "./db/treasury-closing-schema.ts",
    "./db/treasury-routing-schema.ts",
    "./db/treasury-capacity-routing-schema.ts",
    "./db/service-technician-schema.ts",
  ],
  dialect: "sqlite",
});
