import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { callEndReasonEnum, callsTable, db } from "@workspace/db";
import { logger } from "../lib/logger";

export type CallEndReason = (typeof callEndReasonEnum.enumValues)[number];

export type ActiveCall = {
  id: string;
  callerId: string;
  calleeId: string;
  status: "ringing" | "active";
  timeout?: NodeJS.Timeout;
};

// Estado em memória da chamada em andamento -- fonte de verdade RÁPIDA
// (consultada em todo evento de sinalização), com o Postgres como fonte de
// verdade DURÁVEL (sobrevive a um restart do processo, ver comentário em
// signaling/index.ts sobre a limitação de 1 réplica só). As duas reservas
// abaixo (activeByUser/activeById) são preenchidas SINCRONAMENTE antes de
// qualquer `await` em startCall/finishCall -- como Node roda um evento por
// vez até o primeiro await, isso garante que duas chamadas de invite/hangup
// quase simultâneas nunca leem o mapa em estado inconsistente, sem precisar
// de lock explícito.
const activeByUser = new Map<string, ActiveCall>();
const activeById = new Map<string, ActiveCall>();

/**
 * Tenta iniciar uma chamada. Se qualquer um dos dois lados já está
 * ringing/active em outra chamada, devolve "busy" (resolve tanto "callee
 * ocupado" quanto "glare" -- os dois ligando um pro outro ao mesmo tempo --
 * deterministicamente: quem chegar primeiro reserva o slot em memória e
 * ganha, o segundo toma "busy" na hora).
 */
export async function startCall(callerId: string, calleeId: string): Promise<ActiveCall | "busy"> {
  if (activeByUser.has(callerId) || activeByUser.has(calleeId)) return "busy";

  const id = randomUUID();
  const call: ActiveCall = { id, callerId, calleeId, status: "ringing" };
  activeByUser.set(callerId, call);
  activeByUser.set(calleeId, call);
  activeById.set(id, call);

  try {
    await db.insert(callsTable).values({ id, callerId, calleeId, status: "ringing" });
  } catch (err) {
    activeByUser.delete(callerId);
    activeByUser.delete(calleeId);
    activeById.delete(id);
    logger.error({ err, callerId, calleeId }, "call_insert_failed");
    throw err;
  }

  return call;
}

/**
 * Confirma atendimento -- só aceita se quem está aceitando é de fato o
 * callee daquela chamada e ela ainda está "ringing" (evita reaproveitar um
 * accept tardio de uma chamada que já foi cancelada/recusada por outro
 * evento que chegou primeiro).
 */
export async function markAnswered(callId: string, calleeId: string): Promise<ActiveCall | null> {
  const call = activeById.get(callId);
  if (!call || call.calleeId !== calleeId || call.status !== "ringing") return null;
  if (call.timeout) clearTimeout(call.timeout);
  call.status = "active";
  await db
    .update(callsTable)
    .set({ status: "active", answeredAt: new Date() })
    .where(eq(callsTable.id, callId));
  return call;
}

/**
 * Encerra a chamada com o motivo dado. Remove do mapa em memória ANTES de
 * qualquer await -- isso é o que garante que só o PRIMEIRO hangup/decline/
 * timeout concorrente pra mesma chamada realmente encerra (os que chegarem
 * depois recebem null e viram no-op no chamador, ver signaling/index.ts).
 * Devolve null também se a chamada não existe mais neste processo (ex: já
 * foi encerrada, ou o processo reiniciou -- gap conhecido de reconciliação
 * pós-restart, documentado no plano).
 */
export async function finishCall(callId: string, reason: CallEndReason): Promise<ActiveCall | null> {
  const call = activeById.get(callId);
  if (!call) return null;
  if (call.timeout) clearTimeout(call.timeout);
  activeById.delete(callId);
  activeByUser.delete(call.callerId);
  activeByUser.delete(call.calleeId);

  await db
    .update(callsTable)
    .set({ status: "ended", endedAt: new Date(), endReason: reason })
    .where(eq(callsTable.id, callId));

  return call;
}

export const callRegistry = {
  getById(callId: string): ActiveCall | null {
    return activeById.get(callId) ?? null;
  },
  getActiveFor(userId: string): ActiveCall | null {
    return activeByUser.get(userId) ?? null;
  },
};
