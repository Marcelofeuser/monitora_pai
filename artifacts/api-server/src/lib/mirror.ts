import { db, mirrorLogTable } from "@workspace/db";
import { notifyParentOfActivity } from "./notify";

// Compartilhado pelas duas pontas de conversa "espelhada" (Criança <->
// Contato aprovado): grava o mirror_log e dispara a notificação pro
// Responsável, com a mesma cadência de 30min do canal privado (ver
// notify.ts). Extraído daqui porque a lógica de espelhamento antes só
// existia em routes/messages.ts (rota genérica que exige Clerk, então
// nunca rodava pra Criança/Contato) -- agora os dois lados de
// conversations.ts chamam isso diretamente.
export async function mirrorAndNotify(params: {
  conversation: { id: string; lastNotifiedAt: Date | null };
  messageId: string;
  senderId: string;
  parentId: string;
}): Promise<void> {
  await db.insert(mirrorLogTable).values({ messageId: params.messageId, mirroredToParentId: params.parentId });
  await notifyParentOfActivity({ conversation: params.conversation, senderId: params.senderId, parentUserId: params.parentId });
}
