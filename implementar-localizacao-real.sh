#!/usr/bin/env bash
set -euo pipefail

# Este script:
# 1) Atualiza sua copia local do repositorio (git pull)
# 2) Aplica o patch da localizacao real (Crianca compartilha, Responsavel ve no mapa)
# 3) Faz commit e push (o Railway redesenha automaticamente a partir disso)
#
# Rode a partir de ~/Desktop/monitora_pai:
#   bash implementar-localizacao-real.sh

if [ ! -d ".git" ]; then
  echo "Erro: rode este script de dentro da pasta do repositorio (ex: ~/Desktop/monitora_pai)."
  exit 1
fi

echo "==> Atualizando repositorio local (git pull)..."
git pull

echo "==> Aplicando patch da localizacao real..."
PATCH_FILE="$(mktemp)"
cat > "$PATCH_FILE" <<'PATCH_EOF'
diff --git a/artifacts/api-server/src/middlewares/childAuth.ts b/artifacts/api-server/src/middlewares/childAuth.ts
new file mode 100644
index 0000000..a4cf5b8
--- /dev/null
+++ b/artifacts/api-server/src/middlewares/childAuth.ts
@@ -0,0 +1,43 @@
+import { createHash } from "crypto";
+import type { NextFunction, Request, RequestHandler, Response } from "express";
+import { eq } from "drizzle-orm";
+import { db, childDeviceTokensTable } from "@workspace/db";
+
+// A Criança não tem conta Clerk — só entra via pareamento por QR code (ver
+// routes/pairing.ts). O token de dispositivo gerado nesse momento é
+// guardado no aparelho dela (localStorage) e mandado no header
+// X-Child-Token nas rotas que ela precisa chamar. Aqui a gente valida esse
+// token contra o hash salvo no banco e anexa o childId na request.
+export type ChildAuthedRequest = Request & { childId?: string };
+
+export const requireChildAuth: RequestHandler = async (
+  req: ChildAuthedRequest,
+  res: Response,
+  next: NextFunction,
+) => {
+  const header = req.headers["x-child-token"];
+  const token = Array.isArray(header) ? header[0] : header;
+  if (!token) {
+    return res.status(401).json({ error: "not_authenticated" });
+  }
+
+  const tokenHash = createHash("sha256").update(token).digest("hex");
+  const [row] = await db
+    .select()
+    .from(childDeviceTokensTable)
+    .where(eq(childDeviceTokensTable.tokenHash, tokenHash))
+    .limit(1);
+
+  if (!row) {
+    return res.status(401).json({ error: "not_authenticated" });
+  }
+
+  req.childId = row.childId;
+  // Best-effort — não bloqueia a resposta se essa atualização falhar.
+  db.update(childDeviceTokensTable)
+    .set({ lastUsedAt: new Date() })
+    .where(eq(childDeviceTokensTable.id, row.id))
+    .catch(() => {});
+
+  return next();
+};
diff --git a/artifacts/api-server/src/routes/index.ts b/artifacts/api-server/src/routes/index.ts
index c119609..e3ea420 100644
--- a/artifacts/api-server/src/routes/index.ts
+++ b/artifacts/api-server/src/routes/index.ts
@@ -3,6 +3,8 @@ import healthRouter from "./health";
 import pairingRouter from "./pairing";
 import contactsRouter from "./contacts";
 import messagesRouter from "./messages";
+import locationRouter from "./location";
+import migrateLocationRouter from "./migrateLocation";
 
 const router: IRouter = Router();
 
@@ -10,5 +12,7 @@ router.use(healthRouter);
 router.use(pairingRouter);
 router.use(contactsRouter);
 router.use(messagesRouter);
+router.use(locationRouter);
+router.use(migrateLocationRouter);
 
 export default router;
diff --git a/artifacts/api-server/src/routes/location.ts b/artifacts/api-server/src/routes/location.ts
new file mode 100644
index 0000000..c99d981
--- /dev/null
+++ b/artifacts/api-server/src/routes/location.ts
@@ -0,0 +1,69 @@
+import { Router, type IRouter } from "express";
+import { getAuth } from "@clerk/express";
+import { eq, and, desc } from "drizzle-orm";
+import { db, locationsTable, usersTable } from "@workspace/db";
+import { z } from "zod/v4";
+import { requireChildAuth, type ChildAuthedRequest } from "../middlewares/childAuth";
+
+const router: IRouter = Router();
+
+const reportLocationSchema = z.object({
+  latitude: z.number().min(-90).max(90),
+  longitude: z.number().min(-180).max(180),
+  accuracyMeters: z.number().positive().optional(),
+});
+
+/**
+ * POST /api/location
+ * O aparelho da Criança reporta a posição atual. Autenticado pelo token de
+ * dispositivo (header X-Child-Token) — a Criança não usa Clerk. Só existe
+ * uma linha aqui quando a Criança escolhe compartilhar; nunca é inferido.
+ */
+router.post("/location", requireChildAuth, async (req: ChildAuthedRequest, res) => {
+  const childId = req.childId;
+  if (!childId) return res.status(401).json({ error: "not_authenticated" });
+
+  const parsed = reportLocationSchema.safeParse(req.body);
+  if (!parsed.success) {
+    return res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
+  }
+
+  await db.insert(locationsTable).values({
+    childId,
+    latitude: parsed.data.latitude,
+    longitude: parsed.data.longitude,
+    accuracyMeters: parsed.data.accuracyMeters,
+  });
+
+  return res.status(201).json({ ok: true });
+});
+
+/**
+ * GET /api/location/:childId
+ * Responsável consulta a última localização compartilhada por essa
+ * Criança. Retorna `null` (200) quando ela nunca compartilhou nada —
+ * nunca inventa ou estima uma posição.
+ */
+router.get("/location/:childId", async (req, res) => {
+  const auth = getAuth(req);
+  if (!auth.userId) return res.status(401).json({ error: "not_authenticated" });
+
+  const childId = req.params.childId;
+  const [child] = await db
+    .select()
+    .from(usersTable)
+    .where(and(eq(usersTable.id, childId), eq(usersTable.parentId, auth.userId)))
+    .limit(1);
+  if (!child) return res.status(403).json({ error: "not_the_parent_of_this_child" });
+
+  const [latest] = await db
+    .select()
+    .from(locationsTable)
+    .where(eq(locationsTable.childId, childId))
+    .orderBy(desc(locationsTable.recordedAt))
+    .limit(1);
+
+  return res.status(200).json(latest ?? null);
+});
+
+export default router;
diff --git a/artifacts/api-server/src/routes/migrateLocation.ts b/artifacts/api-server/src/routes/migrateLocation.ts
new file mode 100644
index 0000000..b3dcfae
--- /dev/null
+++ b/artifacts/api-server/src/routes/migrateLocation.ts
@@ -0,0 +1,55 @@
+import { Router, type IRouter } from "express";
+import { sql } from "drizzle-orm";
+import { db } from "@workspace/db";
+
+const router: IRouter = Router();
+
+/**
+ * ROTA TEMPORÁRIA — cria as tabelas do recurso de localização real
+ * (child_device_tokens, locations). Só existe porque o banco no Railway
+ * não tem proxy TCP público (drizzle-kit push não roda daqui de fora).
+ *
+ * Seguro rodar mais de uma vez: usa CREATE TABLE IF NOT EXISTS, não apaga
+ * nem altera nada que já existe. Depois de confirmado que funcionou, este
+ * arquivo deve ser removido (mesmo padrão usado em clerkDebug.ts /
+ * dbReset.ts, que já foram removidos depois de resolvidos os erros de
+ * autenticação).
+ */
+router.get("/__debug/migrate-location", async (req, res) => {
+  if (req.query.confirm !== "CRIAR") {
+    return res.status(400).json({
+      error: "confirmation_required",
+      message: "Adicione ?confirm=CRIAR na URL para criar as tabelas de localização.",
+    });
+  }
+
+  try {
+    await db.execute(sql`
+      CREATE TABLE IF NOT EXISTS "child_device_tokens" (
+        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
+        "child_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
+        "token_hash" text NOT NULL UNIQUE,
+        "created_at" timestamp NOT NULL DEFAULT now(),
+        "last_used_at" timestamp
+      )
+    `);
+
+    await db.execute(sql`
+      CREATE TABLE IF NOT EXISTS "locations" (
+        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
+        "child_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
+        "latitude" double precision NOT NULL,
+        "longitude" double precision NOT NULL,
+        "accuracy_meters" double precision,
+        "recorded_at" timestamp NOT NULL DEFAULT now()
+      )
+    `);
+
+    return res.status(200).json({ ok: true, message: "Tabelas de localização prontas." });
+  } catch (err) {
+    const e = err as { message?: string; cause?: { message?: string } };
+    return res.status(500).json({ error: "migration_failed", message: e?.cause?.message ?? e?.message });
+  }
+});
+
+export default router;
diff --git a/artifacts/api-server/src/routes/pairing.ts b/artifacts/api-server/src/routes/pairing.ts
index 19d8906..c856a70 100644
--- a/artifacts/api-server/src/routes/pairing.ts
+++ b/artifacts/api-server/src/routes/pairing.ts
@@ -1,8 +1,8 @@
 import { Router, type IRouter } from "express";
 import { getAuth } from "@clerk/express";
-import { randomBytes, randomUUID } from "crypto";
+import { randomBytes, randomUUID, createHash } from "crypto";
 import { eq, and, isNull, gt } from "drizzle-orm";
-import { db, pairingTokensTable, usersTable } from "@workspace/db";
+import { db, pairingTokensTable, usersTable, childDeviceTokensTable } from "@workspace/db";
 import { z } from "zod/v4";
 
 const router: IRouter = Router();
@@ -120,10 +120,21 @@ router.post("/pairing/confirm", async (req, res) => {
     .set({ usedAt: new Date(), resultingChildUserId: childUser.id })
     .where(eq(pairingTokensTable.id, pairing.id));
 
+  // A Criança não tem conta Clerk — este é o único momento em que ela
+  // recebe uma credencial. O aparelho dela guarda o token bruto (nunca
+  // reemitido); o servidor só guarda o hash. Ver middlewares/childAuth.ts.
+  const rawDeviceToken = randomBytes(32).toString("base64url");
+  const deviceTokenHash = createHash("sha256").update(rawDeviceToken).digest("hex");
+  await db.insert(childDeviceTokensTable).values({
+    childId: childUser.id,
+    tokenHash: deviceTokenHash,
+  });
+
   return res.status(200).json({
     childUserId: childUser.id,
     parentId: pairing.parentId,
     childName: childUser.name,
+    deviceToken: rawDeviceToken,
   });
 });
 
diff --git a/artifacts/controle-parental-pwa/src/App.tsx b/artifacts/controle-parental-pwa/src/App.tsx
index 331ced9..f05a462 100644
--- a/artifacts/controle-parental-pwa/src/App.tsx
+++ b/artifacts/controle-parental-pwa/src/App.tsx
@@ -38,6 +38,8 @@ import { PairingGenerate } from '@/pages/PairingGenerate';
 import { PairingJoin } from '@/pages/PairingJoin';
 import { fetchChildren, fetchApprovedContacts, fetchMirroredMessages } from '@/lib/conversations-api';
 import type { ChildUser, ApprovedContact, MirroredMessage } from '@/lib/conversations-api';
+import { fetchChildLocation } from '@/lib/location-api';
+import type { ChildLocation } from '@/lib/location-api';
 import { Toaster } from '@/components/ui/toaster';
 import { TooltipProvider } from '@/components/ui/tooltip';
 import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
@@ -955,8 +957,103 @@ function EmptyState({ icon: Icon, eyebrow, title, text, actionLabel, onAction, t
 }
 
 function LocationPage() {
-  const { t } = useLanguage();
   const profile = readProfile();
+  // O Responsável vê localização real (backend); a Criança continua com a
+  // tela local de permissão/compartilhamento que já existia.
+  if (profile?.role !== 'child') {
+    return <ResponsibleLocationPage />;
+  }
+  return <ChildLocationPage />;
+}
+
+// Tela real: busca as crianças vinculadas e a última localização reportada
+// por elas, igual ao padrão usado em Conversations() (getToken + fetch*).
+function ResponsibleLocationPage() {
+  const { t } = useLanguage();
+  const { getToken } = useAuth();
+  const [children, setChildren] = useState<ChildUser[] | null>(null);
+  const [location, setLocation] = useState<ChildLocation | null>(null);
+  const [loadError, setLoadError] = useState<string | null>(null);
+
+  useEffect(() => {
+    let cancelled = false;
+    async function load() {
+      try {
+        const token = await getToken();
+        const kids = await fetchChildren(token);
+        if (cancelled) return;
+        setChildren(kids);
+        if (kids.length > 0) {
+          const loc = await fetchChildLocation(kids[0].id, token);
+          if (!cancelled) setLocation(loc);
+        }
+      } catch (err) {
+        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Erro ao carregar localização.');
+      }
+    }
+    load();
+    return () => {
+      cancelled = true;
+    };
+  }, [getToken]);
+
+  const hasChild = (children?.length ?? 0) > 0;
+  const recordedLabel = location ? new Date(location.recordedAt).toLocaleString('pt-BR') : null;
+  // Bounding box pequeno ao redor do ponto, só pra enquadrar o mapa embutido
+  // do OpenStreetMap (sem precisar adicionar leaflet como dependência).
+  const bbox = location
+    ? `${location.longitude - 0.01},${location.latitude - 0.01},${location.longitude + 0.01},${location.latitude + 0.01}`
+    : null;
+
+  return (
+    <>
+      <PageIntro eyebrow={t.location.eyebrow} title={t.location.title} description={t.location.description} />
+      <div className="grid gap-5 lg:grid-cols-[.82fr_1.18fr]">
+        <section className="rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(var(--card))] p-6 shadow-card sm:p-8">
+          <div className="flex items-start justify-between"><IconBox icon={MapPin} tone="gold" /></div>
+          <h2 className="mt-8 font-display text-4xl tracking-[-.05em]">{t.location.title}</h2>
+          {loadError ? (
+            <p className="mt-3 text-xs font-semibold leading-5 text-[hsl(var(--destructive))]" role="alert" data-testid="status-location-error">{loadError}</p>
+          ) : !hasChild ? (
+            <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">Nenhuma criança vinculada ainda. Vá em "Vincular criança" para gerar o QR code de pareamento.</p>
+          ) : !location ? (
+            <p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{children?.[0]?.name ?? 'A criança'} ainda não compartilhou a localização. Isso só acontece quando ela toca em "Compartilhar minha localização" no aparelho dela.</p>
+          ) : (
+            <div className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">
+              <p>Última localização de {children?.[0]?.name}:</p>
+              <p className="mt-2 font-mono-app text-xs">{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</p>
+              <p className="mt-1 text-xs">Registrada em {recordedLabel}{location.accuracyMeters ? ` · precisão de ~${Math.round(location.accuracyMeters)}m` : ''}</p>
+            </div>
+          )}
+        </section>
+        <section className="relative min-h-[430px] overflow-hidden rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(191_25%_25%)] text-[hsl(var(--card))]">
+          {bbox ? (
+            <iframe
+              title="Mapa de localização"
+              className="size-full min-h-[430px] border-0"
+              src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&marker=${location!.latitude},${location!.longitude}`}
+              data-testid="iframe-location-map"
+            />
+          ) : (
+            <div className="relative flex h-full min-h-[430px] flex-col items-center justify-center p-6 text-center sm:p-8">
+              <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'linear-gradient(32deg, transparent 48%, hsl(38 77% 65% / .18) 49%, transparent 50%), linear-gradient(118deg, transparent 48%, hsl(42 32% 95% / .12) 49%, transparent 50%)', backgroundSize: '78px 78px' }} />
+              <span className="relative mb-6 grid size-20 place-items-center rounded-full border border-[hsl(var(--accent)/.45)] bg-[hsl(var(--accent)/.13)] text-[hsl(var(--accent))]"><MapPin size={31} strokeWidth={1.4} /></span>
+              <h2 className="relative font-display text-4xl tracking-[-.05em]">{t.location.noLocation}</h2>
+              <p className="relative mt-3 max-w-[330px] text-sm leading-6 text-[hsl(var(--card)/.65)]">{t.location.mapEmpty}</p>
+            </div>
+          )}
+        </section>
+      </div>
+    </>
+  );
+}
+
+// Mantida como estava: fluxo local de permissão/compartilhamento do lado da
+// Criança dentro do app principal (a tela real de compartilhamento fica em
+// PairingJoin.tsx, mas esta continua existindo pra quem navega direto pra
+// /location no papel de Criança).
+function ChildLocationPage() {
+  const { t } = useLanguage();
   const [permission, setPermission] = useState<'unknown' | 'asking' | 'granted' | 'denied'>('unknown');
   const [sharing, setSharing] = useState(() => localStorage.getItem('amparo-location-sharing') === 'true');
   const [error, setError] = useState('');
@@ -981,11 +1078,11 @@ function LocationPage() {
           <h2 className="mt-8 font-display text-4xl tracking-[-.05em]">{t.location.permission}</h2><p className="mt-3 text-sm leading-6 text-[hsl(var(--muted-foreground))]">{t.location.permissionText}</p>
           <Button className="mt-7 w-full" onClick={requestPermission} disabled={permission === 'asking'} testId="button-request-location">{permission === 'asking' ? t.location.waiting : permission === 'granted' ? t.location.granted : t.location.ask} <Navigation size={16} /></Button>
           {error && <p className="mt-3 text-xs font-semibold leading-5 text-[hsl(var(--destructive))]" role="alert" data-testid="status-location-error">{error}</p>}
-          {profile?.role === 'child' && <div className="mt-8 border-t border-[hsl(var(--border))] pt-6"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-extrabold">{t.location.share}</p><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{sharing ? t.location.sharedChoice : t.location.privateChoice}</p></div><button role="switch" aria-checked={sharing} onClick={toggleSharing} data-testid="switch-location-sharing" className={`relative h-7 w-12 rounded-full transition-colors ${sharing ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}><span className={`absolute top-1 size-5 rounded-full bg-[hsl(var(--card))] shadow-sm transition-transform ${sharing ? 'translate-x-6' : 'translate-x-1'}`} /></button></div></div>}
+          <div className="mt-8 border-t border-[hsl(var(--border))] pt-6"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-extrabold">{t.location.share}</p><p className="mt-1 text-xs leading-5 text-[hsl(var(--muted-foreground))]">{sharing ? t.location.sharedChoice : t.location.privateChoice}</p></div><button role="switch" aria-checked={sharing} onClick={toggleSharing} data-testid="switch-location-sharing" className={`relative h-7 w-12 rounded-full transition-colors ${sharing ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted))]'}`}><span className={`absolute top-1 size-5 rounded-full bg-[hsl(var(--card))] shadow-sm transition-transform ${sharing ? 'translate-x-6' : 'translate-x-1'}`} /></button></div></div>
         </section>
         <section className="relative min-h-[430px] overflow-hidden rounded-[26px] border border-[hsl(var(--card-border))] bg-[hsl(191_25%_25%)] p-6 text-[hsl(var(--card))] sm:p-8">
           <div className="absolute inset-0 opacity-25" style={{ backgroundImage: 'linear-gradient(32deg, transparent 48%, hsl(38 77% 65% / .18) 49%, transparent 50%), linear-gradient(118deg, transparent 48%, hsl(42 32% 95% / .12) 49%, transparent 50%)', backgroundSize: '78px 78px' }} />
-          <div className="relative flex h-full flex-col justify-between"><div className="flex items-center justify-between"><span className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--accent))]">{t.location.map}</span><span className="flex items-center gap-2 rounded-full border border-[hsl(var(--card)/.2)] px-3 py-1.5 text-[10px] font-bold text-[hsl(var(--card)/.65)]"><LockKeyhole size={12} /> {t.location.consent}</span></div><div className="flex flex-1 flex-col items-center justify-center text-center"><span className="mb-6 grid size-20 place-items-center rounded-full border border-[hsl(var(--accent)/.45)] bg-[hsl(var(--accent)/.13)] text-[hsl(var(--accent))]"><MapPin size={31} strokeWidth={1.4} /></span><h2 className="font-display text-4xl tracking-[-.05em]">{t.location.noLocation}</h2><p className="mt-3 max-w-[330px] text-sm leading-6 text-[hsl(var(--card)/.65)]">{profile?.role === 'child' && sharing ? t.location.sharingOnEmpty : t.location.mapEmpty}</p></div><div className="flex items-center gap-2 border-t border-[hsl(var(--card)/.15)] pt-5 text-xs text-[hsl(var(--card)/.6)]"><EyeOff size={15} /> {t.location.noTracking}</div></div>
+          <div className="relative flex h-full flex-col justify-between"><div className="flex items-center justify-between"><span className="font-mono-app text-[10px] uppercase tracking-[.18em] text-[hsl(var(--accent))]">{t.location.map}</span><span className="flex items-center gap-2 rounded-full border border-[hsl(var(--card)/.2)] px-3 py-1.5 text-[10px] font-bold text-[hsl(var(--card)/.65)]"><LockKeyhole size={12} /> {t.location.consent}</span></div><div className="flex flex-1 flex-col items-center justify-center text-center"><span className="mb-6 grid size-20 place-items-center rounded-full border border-[hsl(var(--accent)/.45)] bg-[hsl(var(--accent)/.13)] text-[hsl(var(--accent))]"><MapPin size={31} strokeWidth={1.4} /></span><h2 className="font-display text-4xl tracking-[-.05em]">{t.location.noLocation}</h2><p className="mt-3 max-w-[330px] text-sm leading-6 text-[hsl(var(--card)/.65)]">{sharing ? t.location.sharingOnEmpty : t.location.mapEmpty}</p></div><div className="flex items-center gap-2 border-t border-[hsl(var(--card)/.15)] pt-5 text-xs text-[hsl(var(--card)/.6)]"><EyeOff size={15} /> {t.location.noTracking}</div></div>
         </section>
       </div>
     </>
diff --git a/artifacts/controle-parental-pwa/src/lib/location-api.ts b/artifacts/controle-parental-pwa/src/lib/location-api.ts
new file mode 100644
index 0000000..fe95233
--- /dev/null
+++ b/artifacts/controle-parental-pwa/src/lib/location-api.ts
@@ -0,0 +1,57 @@
+// Cliente para localização real. Dois lados diferentes de autenticação:
+// - O Responsável consulta com o token Bearer do Clerk (mesmo padrão de
+//   conversations-api.ts / pairing-api.ts).
+// - A Criança reporta a posição com o token de dispositivo (não usa Clerk —
+//   ver deviceToken em pairing-api.ts / middlewares/childAuth.ts no backend),
+//   mandado no header X-Child-Token.
+const API_URL = import.meta.env.VITE_API_URL ?? '';
+
+function authHeaders(token?: string | null): HeadersInit {
+  return {
+    'Content-Type': 'application/json',
+    ...(token ? { Authorization: `Bearer ${token}` } : {}),
+  };
+}
+
+function deviceHeaders(deviceToken: string): HeadersInit {
+  return {
+    'Content-Type': 'application/json',
+    'X-Child-Token': deviceToken,
+  };
+}
+
+export type ChildLocation = {
+  latitude: number;
+  longitude: number;
+  accuracyMeters: number | null;
+  recordedAt: string;
+};
+
+// Retorna null quando a Criança nunca compartilhou nada ainda — nunca é um
+// erro, é o estado normal de "ainda não aconteceu".
+export async function fetchChildLocation(
+  childId: string,
+  authToken: string | null,
+): Promise<ChildLocation | null> {
+  const res = await fetch(`${API_URL}/api/location/${encodeURIComponent(childId)}`, {
+    headers: authHeaders(authToken),
+  });
+  if (!res.ok) throw new Error(`fetch_location_failed_${res.status}`);
+  const body = await res.json();
+  return body ?? null;
+}
+
+export async function reportLocation(
+  deviceToken: string,
+  input: { latitude: number; longitude: number; accuracyMeters?: number },
+): Promise<void> {
+  const res = await fetch(`${API_URL}/api/location`, {
+    method: 'POST',
+    headers: deviceHeaders(deviceToken),
+    body: JSON.stringify(input),
+  });
+  if (!res.ok) {
+    const body = await res.json().catch(() => ({}));
+    throw new Error(body.error ?? `report_location_failed_${res.status}`);
+  }
+}
diff --git a/artifacts/controle-parental-pwa/src/lib/pairing-api.ts b/artifacts/controle-parental-pwa/src/lib/pairing-api.ts
index a0751fb..9176177 100644
--- a/artifacts/controle-parental-pwa/src/lib/pairing-api.ts
+++ b/artifacts/controle-parental-pwa/src/lib/pairing-api.ts
@@ -44,6 +44,10 @@ export type ConfirmPairingResponse = {
   childUserId: string;
   parentId: string;
   childName: string;
+  // Credencial do aparelho da Criança — ela não tem conta Clerk, então este
+  // token (guardado no localStorage dela) é o que autentica as rotas que o
+  // aparelho dela precisa chamar (hoje: reportar localização).
+  deviceToken: string;
 };
 
 // Sem token: a Criança ainda não tem conta nesse momento, é exatamente
diff --git a/artifacts/controle-parental-pwa/src/pages/PairingJoin.tsx b/artifacts/controle-parental-pwa/src/pages/PairingJoin.tsx
index 6fa6189..38ef8ca 100644
--- a/artifacts/controle-parental-pwa/src/pages/PairingJoin.tsx
+++ b/artifacts/controle-parental-pwa/src/pages/PairingJoin.tsx
@@ -1,15 +1,25 @@
 import { useEffect, useState } from 'react';
 import { confirmPairing } from '@/lib/pairing-api';
+import { reportLocation } from '@/lib/location-api';
 
 /**
  * Rota /join?token=... — é para onde o link do QR code aponta.
  * Esta é a tela que estava faltando: antes não existia NENHUMA rota que
  * recebesse o token escaneado, por isso o QR "não aprovava nada".
  */
+
+// Chave usada para guardar a credencial do aparelho da Criança. Ela não tem
+// conta Clerk — este token é o que autentica o envio de localização
+// (ver lib/location-api.ts / middlewares/childAuth.ts no backend).
+const DEVICE_TOKEN_KEY = 'amparo-child-device-token';
+
 export function PairingJoin() {
   const [status, setStatus] = useState<'checking' | 'success' | 'error' | 'no_token'>('checking');
   const [errorMessage, setErrorMessage] = useState<string | null>(null);
   const [childName, setChildName] = useState<string | null>(null);
+  const [deviceToken, setDeviceToken] = useState<string | null>(null);
+  const [shareStatus, setShareStatus] = useState<'idle' | 'asking' | 'shared' | 'error'>('idle');
+  const [shareError, setShareError] = useState<string | null>(null);
 
   useEffect(() => {
     const params = new URLSearchParams(window.location.search);
@@ -23,6 +33,12 @@ export function PairingJoin() {
     confirmPairing(token)
       .then((result) => {
         setChildName(result.childName);
+        setDeviceToken(result.deviceToken);
+        try {
+          localStorage.setItem(DEVICE_TOKEN_KEY, result.deviceToken);
+        } catch {
+          // localStorage pode falhar (modo privado, etc.) — não bloqueia o fluxo.
+        }
         setStatus('success');
       })
       .catch((err) => {
@@ -31,6 +47,45 @@ export function PairingJoin() {
       });
   }, []);
 
+  function shareLocation() {
+    const token = deviceToken ?? localStorage.getItem(DEVICE_TOKEN_KEY);
+    if (!token) {
+      setShareStatus('error');
+      setShareError('Não foi possível encontrar a credencial deste aparelho.');
+      return;
+    }
+    if (!('geolocation' in navigator)) {
+      setShareStatus('error');
+      setShareError('Este navegador não suporta localização.');
+      return;
+    }
+    setShareStatus('asking');
+    setShareError(null);
+    navigator.geolocation.getCurrentPosition(
+      (position) => {
+        reportLocation(token, {
+          latitude: position.coords.latitude,
+          longitude: position.coords.longitude,
+          accuracyMeters: position.coords.accuracy ?? undefined,
+        })
+          .then(() => setShareStatus('shared'))
+          .catch((err) => {
+            setShareStatus('error');
+            setShareError(err instanceof Error ? err.message : 'Erro desconhecido.');
+          });
+      },
+      (err) => {
+        setShareStatus('error');
+        setShareError(
+          err.code === err.PERMISSION_DENIED
+            ? 'Permissão de localização negada.'
+            : 'Não foi possível obter a localização.',
+        );
+      },
+      { enableHighAccuracy: true, timeout: 15000 },
+    );
+  }
+
   return (
     <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-6 text-center">
       {status === 'checking' && <p>Confirmando vínculo com o Responsável…</p>}
@@ -64,6 +119,32 @@ export function PairingJoin() {
           <p className="text-sm text-[hsl(var(--muted-foreground))]">
             Seu aparelho já está vinculado ao Responsável. Você já pode usar o app normalmente.
           </p>
+
+          <div className="mt-4 w-full rounded-lg border border-[hsl(var(--border))] p-4 text-left">
+            <h2 className="text-base font-semibold">Compartilhar minha localização</h2>
+            <p className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">
+              Só acontece quando você escolhe — sem rastreamento em segundo plano. Toque no botão
+              sempre que quiser que o Responsável veja onde você está agora.
+            </p>
+            <button
+              type="button"
+              onClick={shareLocation}
+              disabled={shareStatus === 'asking'}
+              className="mt-3 w-full rounded-md bg-[hsl(var(--primary))] px-4 py-2 text-sm font-medium text-[hsl(var(--primary-foreground))] disabled:opacity-60"
+            >
+              {shareStatus === 'asking'
+                ? 'Pedindo permissão…'
+                : shareStatus === 'shared'
+                  ? 'Compartilhado! Compartilhar de novo'
+                  : 'Compartilhar minha localização agora'}
+            </button>
+            {shareStatus === 'shared' && (
+              <p className="mt-2 text-sm text-green-600">Localização enviada com sucesso.</p>
+            )}
+            {shareStatus === 'error' && shareError && (
+              <p className="mt-2 text-sm text-red-600">{shareError}</p>
+            )}
+          </div>
         </>
       )}
     </div>
diff --git a/lib/db/src/schema/index.ts b/lib/db/src/schema/index.ts
index 1908805..82983bb 100644
--- a/lib/db/src/schema/index.ts
+++ b/lib/db/src/schema/index.ts
@@ -3,3 +3,4 @@ export * from "./pairing";
 export * from "./contacts";
 export * from "./messages";
 export * from "./subscriptions";
+export * from "./location";
diff --git a/lib/db/src/schema/location.ts b/lib/db/src/schema/location.ts
new file mode 100644
index 0000000..9ac7a3d
--- /dev/null
+++ b/lib/db/src/schema/location.ts
@@ -0,0 +1,33 @@
+import { pgTable, uuid, text, timestamp, doublePrecision } from "drizzle-orm/pg-core";
+import { usersTable } from "./users";
+
+// Token de dispositivo da Criança: como ela não tem conta Clerk (só entra
+// via pareamento por QR code — ver routes/pairing.ts), esse token, gerado
+// uma única vez no momento da confirmação do vínculo, é a forma dela se
+// autenticar nas rotas que o aparelho dela precisa chamar (hoje: só
+// reportar localização). Guardamos apenas o hash (sha256) do token, nunca
+// o valor bruto — mesmo princípio de uma senha. Ver middlewares/childAuth.ts.
+export const childDeviceTokensTable = pgTable("child_device_tokens", {
+  id: uuid("id").primaryKey().defaultRandom(),
+  childId: text("child_id")
+    .notNull()
+    .references(() => usersTable.id, { onDelete: "cascade" }),
+  tokenHash: text("token_hash").notNull().unique(),
+  createdAt: timestamp("created_at").defaultNow().notNull(),
+  lastUsedAt: timestamp("last_used_at"),
+});
+
+// Histórico de posições reportadas pela Criança. Nunca inferida ou
+// preenchida automaticamente — só existe uma linha aqui quando o aparelho
+// da Criança de fato mandou uma posição (consentimento explícito, sem
+// rastreamento em segundo plano).
+export const locationsTable = pgTable("locations", {
+  id: uuid("id").primaryKey().defaultRandom(),
+  childId: text("child_id")
+    .notNull()
+    .references(() => usersTable.id, { onDelete: "cascade" }),
+  latitude: doublePrecision("latitude").notNull(),
+  longitude: doublePrecision("longitude").notNull(),
+  accuracyMeters: doublePrecision("accuracy_meters"),
+  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
+});
PATCH_EOF

git apply "$PATCH_FILE"
rm -f "$PATCH_FILE"

echo "==> Adicionando arquivos..."
git add -A -- \
  artifacts/api-server/src/middlewares/childAuth.ts \
  artifacts/api-server/src/routes/index.ts \
  artifacts/api-server/src/routes/location.ts \
  artifacts/api-server/src/routes/migrateLocation.ts \
  artifacts/api-server/src/routes/pairing.ts \
  artifacts/controle-parental-pwa/src/App.tsx \
  artifacts/controle-parental-pwa/src/lib/location-api.ts \
  artifacts/controle-parental-pwa/src/lib/pairing-api.ts \
  artifacts/controle-parental-pwa/src/pages/PairingJoin.tsx \
  lib/db/src/schema/index.ts \
  lib/db/src/schema/location.ts

echo "==> Criando commit..."
git commit -m "$(cat <<'COMMIT_EOF'
Implementa localizacao real: Crianca compartilha (com consentimento), Responsavel ve no mapa

- Novo token de dispositivo pra Crianca (nao tem conta Clerk): emitido no
  pareamento, guardado no aparelho dela, usado so pra reportar localizacao.
- Botao "Compartilhar minha localizacao agora" na tela pos-pareamento da
  Crianca (so acontece quando ela toca, nunca em segundo plano).
- Tela de Localizacao do Responsavel agora busca a ultima localizacao real
  da crianca vinculada e mostra num mapa de verdade (OpenStreetMap embutido,
  sem precisar adicionar nenhuma biblioteca nova).
- Rota temporaria /api/__debug/migrate-location cria as duas tabelas novas
  no banco (o banco do Railway nao tem proxy TCP publico, entao isso nao da
  pra rodar daqui de fora) — rodar uma vez depois do deploy e depois remover,
  mesmo padrao usado nas correcoes anteriores.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018gjMny7NXXrbAnQF6p1Ba6
COMMIT_EOF
)"

echo "==> Enviando pro GitHub (git push)..."
git push

echo ""
echo "=================================================================="
echo "Pronto! O Railway vai comecar a rebuildar sozinho a partir do push."
echo ""
echo "IMPORTANTE - passo manual depois que o deploy terminar (uns 2-3 min):"
echo "Abra esta URL no navegador UMA VEZ (cria as tabelas novas no banco):"
echo ""
echo "  https://api-server-production-c955.up.railway.app/api/__debug/migrate-location?confirm=CRIAR"
echo ""
echo "Deve aparecer: {\"ok\":true,\"message\":\"Tabelas de localizacao prontas.\"}"
echo "Depois disso, a Crianca ja pode usar o botao de compartilhar localizacao"
echo "na tela que aparece apos escanear o QR code, e o Responsavel ja ve o mapa"
echo "na aba Localizacao."
echo "=================================================================="
