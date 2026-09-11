import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as coreSchema from "./schema";
import * as slaSchema from "./sla-schema";
import * as profitabilitySchema from "./profitability-schema";
import * as goalScopeSchema from "./goal-scope-schema";
import * as treasurySchema from "./treasury-schema";
import * as treasuryClosingSchema from "./treasury-closing-schema";
import * as treasuryRoutingSchema from "./treasury-routing-schema";

const schema = {
  ...coreSchema,
  ...slaSchema,
  ...profitabilitySchema,
  ...goalScopeSchema,
  ...treasurySchema,
  ...treasuryClosingSchema,
  ...treasuryRoutingSchema,
};

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Set the `d1` field in .openai/hosting.json to `DB` or let your control plane inject the real binding values before using the database."
    );
  }

  return drizzle(env.DB, { schema });
}
