import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { sendPushToChild, sendPushToContact, sendPushToParent } from "../lib/webPush";
import { sendFcmToParent } from "../lib/fcm";
import { logger } from "../lib/logger";

/**
 * Avisa `calleeId` de uma chamada recebida via push -- disparado em
 * paralelo ao evento de socket sempre que o callee não está com nenhum
 * socket conectado agora (ver isOnline em signaling/index.ts), pra cobrir o
 * caso de app em background/aba fechada. Resolve o papel (Responsável,
 * Criança ou Contato) pra mandar pelo canal certo -- mesmo trio de
 * pushSubscriptionsTable usado no resto do app (ver lib/notify.ts).
 *
 * CORTE DE ESCOPO CONHECIDO (app nativo iOS): FCM sozinho não consegue
 * "acordar" uma tela de atender chamada sem CallKit + VoIP push (mudança
 * grande no projeto Xcode, fora de escopo aqui). Na v1 o Responsável no app
 * nativo recebe a notificação, abre o app, e atende manualmente se a
 * chamada ainda estiver tocando dentro da janela de timeout.
 */
export async function sendIncomingCallPush(calleeId: string, callerName: string): Promise<void> {
  const [callee] = await db.select().from(usersTable).where(eq(usersTable.id, calleeId)).limit(1);
  if (!callee) return;

  const payload = {
    title: "Amparo",
    body: `${callerName} está te ligando`,
    url: callee.role === "contact" ? "/contact" : "./",
  };

  try {
    if (callee.role === "parent") {
      await Promise.all([sendPushToParent(calleeId, payload), sendFcmToParent(calleeId, payload)]);
    } else if (callee.role === "child") {
      await sendPushToChild(calleeId, payload);
    } else if (callee.role === "contact") {
      await sendPushToContact(calleeId, payload);
    }
  } catch (err) {
    logger.error({ err, calleeId }, "incoming_call_push_send_failed");
  }
}
