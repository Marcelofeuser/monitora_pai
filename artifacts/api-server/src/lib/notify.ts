import { eq } from "drizzle-orm";
import { conversationsTable, db, usersTable } from "@workspace/db";
import { sendPushToChild, sendPushToParent } from "./webPush";
import { sendFcmToParent } from "./fcm";

const RENOTIFY_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Item 10 do pedido: "toda vez que iniciar um bate papo com alguém, o app
 * me notifica; caso já seja uma conversa que já fui notificado, avisa com
 * um intervalo de 30 min". Ou seja: notifica na hora na primeira vez, e
 * depois só de novo se já tiver passado 30min da última notificação
 * daquela conversa — nunca por mensagem individual.
 *
 * Chamado depois de gravar qualquer mensagem cujo remetente NÃO seja o
 * próprio Responsável (ele não precisa ser notificado do que ele mesmo
 * mandou) — cobre tanto a criança escrevendo no canal privado quanto,
 * futuramente, contato/grupo espelhado.
 */
export async function notifyParentOfActivity(params: {
  conversation: { id: string; lastNotifiedAt: Date | null };
  senderId: string;
  parentUserId: string;
}): Promise<void> {
  const { conversation, senderId, parentUserId } = params;
  if (senderId === parentUserId) return;

  if (conversation.lastNotifiedAt) {
    const elapsed = Date.now() - conversation.lastNotifiedAt.getTime();
    if (elapsed < RENOTIFY_INTERVAL_MS) return;
  }

  // Marca a notificação ANTES de mandar — evita reenvio duplicado se duas
  // mensagens chegarem quase juntas antes do push terminar.
  await db
    .update(conversationsTable)
    .set({ lastNotifiedAt: new Date() })
    .where(eq(conversationsTable.id, conversation.id));

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, senderId)).limit(1);
  const senderName = sender?.name ?? "Alguém";

  const payload = {
    title: "Amparo",
    body: `${senderName} tem uma conversa ativa no chat`,
    url: "/conversations",
  };
  // Manda pelos dois canais: Web Push (navegador/Android) e FCM nativo
  // (app iOS "Amparo", que não tem acesso à Web Push API do navegador —
  // ver comentário em schema/notifications.ts). Cada um só manda de
  // verdade se o Responsável tiver assinatura/token daquele tipo.
  await Promise.all([sendPushToParent(parentUserId, payload), sendFcmToParent(parentUserId, payload)]);
}

/**
 * Pedido do Marcelo: a Criança também deve ser notificada quando o
 * Responsável manda mensagem pra ela — hoje só o Responsável era avisado
 * (item 10 original). Mesma cadência do item 10 (notifica na hora se é a
 * primeira vez, senão só de novo depois de 30min), pra não virar um push
 * por mensagem numa conversa ativa; usa `lastNotifiedChildAt`, um relógio
 * de debounce separado do do Responsável (ver comentário no schema).
 *
 * Chamado depois de gravar qualquer mensagem cujo remetente seja o
 * Responsável (ele mandando pra própria Criança) — nunca quando é a
 * Criança mandando pra ela mesma, o que nem existe.
 */
export async function notifyChildOfActivity(params: {
  conversation: { id: string; lastNotifiedChildAt: Date | null };
  parentUserId: string;
  childId: string;
}): Promise<void> {
  const { conversation, parentUserId, childId } = params;

  if (conversation.lastNotifiedChildAt) {
    const elapsed = Date.now() - conversation.lastNotifiedChildAt.getTime();
    if (elapsed < RENOTIFY_INTERVAL_MS) return;
  }

  // Marca ANTES de mandar — mesmo motivo do notifyParentOfActivity: evita
  // reenvio duplicado se duas mensagens chegarem quase juntas.
  await db
    .update(conversationsTable)
    .set({ lastNotifiedChildAt: new Date() })
    .where(eq(conversationsTable.id, conversation.id));

  const [parent] = await db.select().from(usersTable).where(eq(usersTable.id, parentUserId)).limit(1);
  const parentName = parent?.name ?? "Seu Responsável";

  await sendPushToChild(childId, {
    title: "Amparo",
    body: `${parentName} te mandou uma mensagem`,
    url: "./",
  });
}
