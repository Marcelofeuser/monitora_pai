import { Server as SocketIOServer, type Socket } from "socket.io";
import type { Server as HttpServer } from "node:http";
import { createHash } from "node:crypto";
import { clerkClient } from "@clerk/express";
import { and, eq, inArray } from "drizzle-orm";
import { childDeviceTokensTable, contactDeviceTokensTable, db, usersTable } from "@workspace/db";
import { authorizeCall } from "../lib/calls";
import { logger } from "../lib/logger";
import {
  callRegistry,
  finishCall,
  markAnswered,
  startCall,
  type ActiveCall,
} from "./callState";
import { sendIncomingCallPush } from "./push";

// LIMITE CONHECIDO: usa o adapter em memória padrão do Socket.IO -- funciona
// hoje porque o api-server roda em 1 réplica só (confirmado no Railway,
// 09/09/2026). Se um dia subir pra 2+ réplicas, presence/signaling QUEBRA
// silenciosamente (uma chamada pode "tocar" numa réplica em que o outro
// lado não está conectado). Precisaria de @socket.io/redis-adapter + um
// serviço Redis no Railway antes de escalar horizontalmente -- não
// construído agora, só documentado aqui pra não ser esquecido.

const RING_TIMEOUT_MS = 40_000;
const DISCONNECT_GRACE_MS = 15_000;

type Identity = { userId: string; role: "parent" | "child" | "contact" };

type HandshakeAuth = {
  clerkToken?: string;
  childToken?: string;
  contactToken?: string;
};

// socket.on(event, handler) do Node EventEmitter NÃO tem o mesmo tratamento
// de promise que uma rota Express 5 tem (lá, retornar uma Promise rejeitada
// de um handler async vira next(err) automaticamente -- é por isso que o
// resto do repo não precisa de wrapper nas rotas HTTP). Aqui é EventEmitter
// puro: um handler async que rejeita vira um unhandledRejection de verdade,
// que em runtime derruba o processo inteiro (Node 15+) -- ou seja, um
// hiccup passageiro do Postgres durante UMA chamada tiraria o chat inteiro
// do ar pra todo mundo. `safe` fecha esse buraco pros listeners de evento;
// `safeTimeout` fecha o mesmo buraco pros callbacks de setTimeout usados
// abaixo (call:invite e disconnect), que rodam soltos, sem nenhum handler
// "pai" esperando por eles.
function safe<Args extends unknown[]>(
  event: string,
  handler: (...args: Args) => Promise<void> | void,
): (...args: Args) => Promise<void> {
  return async (...args: Args) => {
    try {
      await handler(...args);
    } catch (err) {
      logger.error({ err, event }, "signaling_handler_error");
      const maybeAck = args[args.length - 1];
      if (typeof maybeAck === "function") {
        (maybeAck as (res: unknown) => void)({ error: "internal_error" });
      }
    }
  };
}

function safeTimeout(event: string, fn: () => Promise<void>): () => void {
  return () => {
    fn().catch((err) => logger.error({ err, event }, "signaling_timeout_error"));
  };
}

// Resolve a identidade do handshake do socket pelos mesmos três mecanismos
// já usados nas rotas HTTP (getAuth/requireChildAuth/requireContactAuth) --
// só que fora do pipeline do Express, porque o WebSocket nativo do
// navegador não manda headers customizados. O Socket.IO resolve isso: o
// cliente manda o token certo dentro de `auth` no handshake (ver
// lib/socket.ts na PWA).
async function resolveIdentity(auth: HandshakeAuth): Promise<Identity | null> {
  if (auth.clerkToken) {
    // Trocado de verifyToken(token, {secretKey}) pra clerkClient.authenticateRequest(...)
    // -- achado em produção (09-10) que verifyToken tava rejeitando TODO
    // token do Responsável (logs mostravam "signaling_clerk_token_invalid"
    // pra 100% das tentativas de handshake, mesmo com tokens frescos que a
    // MESMA requisição HTTP, milissegundos antes, aceitava). authenticateRequest
    // é o mecanismo que clerkMiddleware/getAuth já usa com sucesso pras
    // rotas HTTP deste mesmo servidor (ver app.ts) -- construindo um Request
    // sintético só com o header Authorization, reproduz exatamente a mesma
    // validação já comprovada, em vez de reimplementar a verificação "na
    // unha" com verifyToken (cuja assinatura {data,errors}/exceção difere
    // sutilmente entre versões do @clerk/backend e não bateu com o
    // comportamento real aqui).
    try {
      const requestState = await clerkClient.authenticateRequest(
        new Request("https://signaling.internal/", {
          headers: { Authorization: `Bearer ${auth.clerkToken}` },
        }),
        {
          // Mesma lista de app.ts (clerkMiddleware) -- ver comentário lá.
          authorizedParties: [
            "https://pwa-production-336a.up.railway.app",
            "https://api-server-production-c955.up.railway.app",
            "https://responsavel.amparakids.com",
            "https://crianca.amparakids.com",
            "https://amparakids.com",
          ],
        },
      );
      const authObj = requestState.toAuth();
      const userId = authObj?.userId;
      if (userId) return { userId, role: "parent" };
      logger.warn(
        { reason: requestState.reason, message: requestState.message },
        "signaling_clerk_token_invalid",
      );
      return null;
    } catch (err) {
      logger.warn({ err }, "signaling_clerk_token_verify_threw");
      return null;
    }
  }

  if (auth.childToken) {
    try {
      const tokenHash = createHash("sha256").update(auth.childToken).digest("hex");
      const [row] = await db
        .select()
        .from(childDeviceTokensTable)
        .where(eq(childDeviceTokensTable.tokenHash, tokenHash))
        .limit(1);
      if (row) return { userId: row.childId, role: "child" };
      return null;
    } catch (err) {
      logger.warn({ err }, "signaling_child_token_lookup_failed");
      return null;
    }
  }

  if (auth.contactToken) {
    try {
      const tokenHash = createHash("sha256").update(auth.contactToken).digest("hex");
      const [row] = await db
        .select()
        .from(contactDeviceTokensTable)
        .where(eq(contactDeviceTokensTable.tokenHash, tokenHash))
        .limit(1);
      if (row?.contactUserId) return { userId: row.contactUserId, role: "contact" };
      return null;
    } catch (err) {
      logger.warn({ err }, "signaling_contact_token_lookup_failed");
      return null;
    }
  }

  return null;
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

// Um usuário pode ter mais de um socket (várias abas) -- ver `has_online`
// abaixo. isOnline usa isso pra decidir entre "toca e espera" vs. "toca e
// já dispara push em paralelo" (callee offline).
function isOnline(io: SocketIOServer, userId: string): boolean {
  const room = io.sockets.adapter.rooms.get(userRoom(userId));
  return Boolean(room && room.size > 0);
}

async function namesById(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(inArray(usersTable.id, ids));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export function attachSignaling(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    path: "/socket.io",
    cors: { origin: true, credentials: true },
  });

  io.use(async (socket, next) => {
    const identity = await resolveIdentity((socket.handshake.auth ?? {}) as HandshakeAuth);
    if (!identity) return next(new Error("not_authenticated"));
    socket.data.userId = identity.userId;
    socket.data.role = identity.role;
    next();
  });

  io.on("connection", (socket: Socket) => {
    const userId: string = socket.data.userId;
    socket.join(userRoom(userId));

    socket.on(
      "call:invite",
      safe("call:invite", async ({ calleeId }: { calleeId?: string }, ack?: (res: unknown) => void) => {
        const reply = ack ?? (() => {});
        if (!calleeId || typeof calleeId !== "string") return reply({ error: "invalid_callee" });

        const auth = await authorizeCall(userId, calleeId);
        if (!auth.ok) return reply({ error: auth.reason });

        // Ocupado: já existe uma chamada ringing/active envolvendo o callee
        // (ou o caller). Resolve glare deterministicamente -- quem chegou
        // primeiro no in-memory state ganha, o segundo toma "busy" na hora
        // em vez de tocar duas vezes ou entrar em corrida no cliente.
        const busyWith = await startCall(userId, calleeId);
        if (busyWith === "busy") return reply({ error: "busy" });
        const call = busyWith as ActiveCall;

        const names = await namesById([userId]);
        const callerName = names.get(userId) ?? "Alguém";

        io.to(userRoom(calleeId)).emit("call:incoming", {
          callId: call.id,
          callerId: userId,
          callerName,
        });

        if (!isOnline(io, calleeId)) {
          // Callee sem socket conectado agora -- dispara push em paralelo,
          // mas mantém o mesmo timer de toque (o push pode fazer o app abrir
          // e conectar a tempo de atender).
          sendIncomingCallPush(calleeId, callerName).catch((err) => {
            logger.error({ err, calleeId }, "incoming_call_push_failed");
          });
        }

        call.timeout = setTimeout(
          safeTimeout("call:invite:ring_timeout", async () => {
            const ended = await finishCall(call.id, "missed");
            if (!ended) return;
            io.to(userRoom(userId)).emit("call:missed", { callId: call.id });
            io.to(userRoom(calleeId)).emit("call:missed", { callId: call.id });
          }),
          RING_TIMEOUT_MS,
        );

        reply({ callId: call.id });
      }),
    );

    socket.on(
      "call:accept",
      safe("call:accept", async ({ callId }: { callId?: string }) => {
        if (!callId) return;
        const call = await markAnswered(callId, userId);
        if (!call) return;
        io.to(userRoom(call.callerId)).emit("call:accepted", { callId });
      }),
    );

    socket.on(
      "call:decline",
      safe("call:decline", async ({ callId }: { callId?: string }) => {
        if (!callId) return;
        const call = await finishCall(callId, "declined");
        if (!call) return;
        io.to(userRoom(call.callerId)).emit("call:declined", { callId });
      }),
    );

    socket.on(
      "call:cancel",
      safe("call:cancel", async ({ callId }: { callId?: string }) => {
        if (!callId) return;
        const call = await finishCall(callId, "canceled");
        if (!call) return;
        io.to(userRoom(call.calleeId)).emit("call:canceled", { callId });
      }),
    );

    socket.on(
      "call:hangup",
      safe("call:hangup", async ({ callId, reason }: { callId?: string; reason?: string }) => {
        if (!callId) return;
        const endReason = reason === "failed" ? "failed" : "hangup";
        const call = await finishCall(callId, endReason);
        if (!call) return;
        const otherId = call.callerId === userId ? call.calleeId : call.callerId;
        io.to(userRoom(otherId)).emit("call:ended", { callId, reason: endReason });
      }),
    );

    // Relay puro de sinalização WebRTC -- o servidor nunca inspeciona SDP/
    // ICE, só repassa pro outro participante do callId (mesmo modelo de
    // confiança de routes/media.ts: só garante que os dois são realmente
    // os participantes daquela chamada).
    const relay = (event: string) =>
      safe(event, async (payload: { callId?: string; [k: string]: unknown }) => {
        const call = payload?.callId ? callRegistry.getById(payload.callId) : null;
        if (!call) return;
        if (call.callerId !== userId && call.calleeId !== userId) return;
        const otherId = call.callerId === userId ? call.calleeId : call.callerId;
        io.to(userRoom(otherId)).emit(event, payload);
      });
    socket.on("webrtc:offer", relay("webrtc:offer"));
    socket.on("webrtc:answer", relay("webrtc:answer"));
    socket.on("webrtc:ice-candidate", relay("webrtc:ice-candidate"));

    socket.on(
      "disconnect",
      safe("disconnect", async () => {
        // Se esse era o único socket desse usuário (não tem mais nenhum na
        // sala pessoal) e ele tinha uma chamada ATIVA, espera um respiro
        // (troca rápida de app/aba não deveria matar a chamada na hora) antes
        // de encerrar como "failed".
        setTimeout(
          safeTimeout("disconnect:grace", async () => {
            if (isOnline(io, userId)) return; // reconectou a tempo
            const call = callRegistry.getActiveFor(userId);
            if (!call) return;
            const ended = await finishCall(call.id, "failed");
            if (!ended) return;
            const otherId = call.callerId === userId ? call.calleeId : call.callerId;
            io.to(userRoom(otherId)).emit("call:ended", { callId: call.id, reason: "failed" });
          }),
          DISCONNECT_GRACE_MS,
        );
      }),
    );
  });

  return io;
}
