import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { logger } from "./logger";

// Chaves VAPID identificam o servidor pros serviços de push dos navegadores
// (FCM, Mozilla Push, etc.) — geradas uma vez com `npx web-push
// generate-vapid-keys` e guardadas como variável no Railway
// (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no api-server; a pública também vai
// pro pwa como VITE_VAPID_PUBLIC_KEY, pro navegador usar na assinatura).
// Sem elas configuradas, notificação simplesmente não é mandada — não
// derruba o envio de mensagem por causa disso.
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const contactEmail = process.env.VAPID_CONTACT_EMAIL ?? "mailto:contato@amparo.app";

let configured = false;
function ensureConfigured(): boolean {
  if (!publicKey || !privateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(contactEmail, publicKey, privateKey);
    configured = true;
  }
  return true;
}

export type PushPayload = { title: string; body: string; url?: string };

// Manda a notificação pra TODAS as assinaturas daquele Responsável (ele
// pode ter mais de um navegador/aparelho com "Notificações" ligado).
// Assinatura expirada/revogada (404/410 do serviço de push) é removida do
// banco na hora — evita ficar tentando mandar pra endpoint morto pra
// sempre.
export async function sendPushToParent(parentUserId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return;

  const subscriptions = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.parentUserId, parentUserId));

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.id, sub.id));
          return;
        }
        logger.error({ err, parentUserId }, "push_send_failed");
      }
    }),
  );
}
