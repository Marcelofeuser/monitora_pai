import { db, mirrorLogTable } from "@workspace/db";
import { notifyParentOfActivity } from "./notify";
import { getGuardiansOfChild } from "./guardians";

// Compartilhado pelas duas pontas de conversa "espelhada" (Criança <->
// Contato aprovado): grava o mirror_log e dispara a notificação pra TODOS
// os Responsáveis da Criança (dono + guardians adicionais -- item 13 do
// pedido), com a mesma cadência de 30min do canal privado (ver notify.ts).
// Antes só espelhava/notificava pro dono original (child.parentId) -- um
// guardian adicional nunca via o espelho nem era avisado. Extraído daqui
// porque a lógica de espelhamento antes só existia em routes/messages.ts
// (rota genérica que exige Clerk, então nunca rodava pra Criança/Contato)
// -- agora os dois lados de conversations.ts chamam isso diretamente.
export async function mirrorAndNotify(params: {
  conversation: { id: string; lastNotifiedAt: Date | null };
  messageId: string;
  senderId: string;
  childId: string;
}): Promise<void> {
  const guardians = await getGuardiansOfChild(params.childId);
  await Promise.all(
    guardians.map((g) =>
      db.insert(mirrorLogTable).values({ messageId: params.messageId, mirroredToParentId: g.id }),
    ),
  );
  // Debounce por conversa (compartilhado entre guardians -- ver
  // conversationsTable.lastNotifiedAt): dispara pra todos de uma vez
  // quando a cadência de 30min permite.
  await Promise.all(
    guardians.map((g) =>
      notifyParentOfActivity({ conversation: params.conversation, senderId: params.senderId, parentUserId: g.id }),
    ),
  );
}
