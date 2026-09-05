import admin from "firebase-admin";
import { eq } from "drizzle-orm";
import { db, fcmTokensTable } from "@workspace/db";
import { logger } from "./logger";
import type { PushPayload } from "./webPush";

// Push NATIVO (Firebase Cloud Messaging / APNs) — usado hoje só pelo app
// iOS "Amparo" (Responsável), porque o WKWebView dele não tem acesso à Web
// Push API do navegador (ver comentário em schema/notifications.ts). A
// credencial é a Service Account do Firebase, gerada em Project Settings >
// Service Accounts > Generate new private key, colada inteira (o JSON) na
// variável FIREBASE_SERVICE_ACCOUNT_JSON no Railway. Sem ela configurada,
// notificação nativa simplesmente não é mandada — igual ao padrão do
// webPush.ts, não derruba o envio de mensagem por causa disso.
let app: admin.app.App | null = null;
let attempted = false;

function ensureFirebaseApp(): admin.app.App | null {
  if (app) return app;
  if (attempted) return null;
  attempted = true;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  try {
    const serviceAccount = JSON.parse(raw);
    app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    return app;
  } catch (err) {
    logger.error({ err }, "fcm_init_failed");
    return null;
  }
}

// Mesma ideia do sendPushToSubscriptions em webPush.ts: manda pra todos os
// tokens FCM daquele Responsável, e remove do banco na hora qualquer token
// que o Firebase disser que não é mais válido (app desinstalado, token
// expirado etc.) — evita ficar tentando mandar pra token morto pra sempre.
export async function sendFcmToParent(parentUserId: string, payload: PushPayload): Promise<void> {
  const firebaseApp = ensureFirebaseApp();
  if (!firebaseApp) return;

  const tokens = await db.select().from(fcmTokensTable).where(eq(fcmTokensTable.parentUserId, parentUserId));
  if (tokens.length === 0) return;

  await Promise.all(
    tokens.map(async (row) => {
      try {
        await firebaseApp.messaging().send({
          token: row.token,
          notification: { title: payload.title, body: payload.body },
          data: payload.url ? { url: payload.url } : undefined,
          apns: { payload: { aps: { sound: "default" } } },
        });
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token") {
          await db.delete(fcmTokensTable).where(eq(fcmTokensTable.id, row.id));
          return;
        }
        logger.error({ err, parentUserId }, "fcm_send_failed");
      }
    }),
  );
}
