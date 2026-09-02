import { eq } from "drizzle-orm";
import { conversationsTable, db, usersTable } from "@workspace/db";
import { sendPushToParent } from "./webPush";

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

  await sendPushToParent(parentUserId, {
    title: "Amparo",
    body: `${senderName} tem uma conversa ativa no chat`,
    url: "/conversations",
  });
}
