import {
  pgTable,
  text,
  timestamp,
  integer,
  uniqueIndex,
  check,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Armazena somente o hash da origem que está realizando tentativas
// de pareamento. O valor original (por exemplo, o IP) não é persistido.
export const pairingRateLimitsTable = pgTable(
  "pairing_rate_limits",
  {
    id: text("id").primaryKey(),
    sourceHash: text("source_hash").notNull(),
    windowStartedAt: timestamp("window_started_at").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    blockedUntil: timestamp("blocked_until"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("pairing_rate_limits_source_hash_unique").on(table.sourceHash),
    index("pairing_rate_limits_blocked_until_idx").on(table.blockedUntil),
    check(
      "pairing_rate_limits_attempt_count_nonnegative",
      sql`${table.attemptCount} >= 0`,
    ),
  ],
);
