import { pgTable, uuid, text, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Token de dispositivo da Criança: como ela não tem conta Clerk (só entra
// via pareamento por QR code — ver routes/pairing.ts), esse token, gerado
// uma única vez no momento da confirmação do vínculo, é a forma dela se
// autenticar nas rotas que o aparelho dela precisa chamar (hoje: só
// reportar localização). Guardamos apenas o hash (sha256) do token, nunca
// o valor bruto — mesmo princípio de uma senha. Ver middlewares/childAuth.ts.
export const childDeviceTokensTable = pgTable("child_device_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: text("child_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
});

// Histórico de posições reportadas pela Criança. Nunca inferida ou
// preenchida automaticamente — só existe uma linha aqui quando o aparelho
// da Criança de fato mandou uma posição (consentimento explícito, sem
// rastreamento em segundo plano).
export const locationsTable = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: text("child_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  accuracyMeters: doublePrecision("accuracy_meters"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});
