import { io, type Socket } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL ?? "";

// Credencial que o handshake do Socket.IO manda pra se autenticar --
// exatamente um dos três, igual aos três mecanismos já usados no resto do
// app (Bearer Clerk, X-Child-Token, X-Contact-Token). WebSocket nativo não
// manda headers customizados, mas o payload `auth` do Socket.IO sim -- é
// por isso que a sinalização usa Socket.IO em vez de WebSocket cru (ver
// signaling/index.ts no api-server).
export type SignalingAuth =
  | { clerkToken: string }
  | { childToken: string }
  | { contactToken: string };

// Chamado de novo em TODA tentativa de conexão do socket.io -- a inicial e
// as automáticas de reconnection: true, não só uma vez no mount. Essencial
// pro Responsável: o token Clerk expira em ~60s, então se passássemos um
// valor fixo, uma reconexão automática depois de queda de rede (wifi
// instável, notebook dormindo) tentaria de novo com o MESMO token vencido
// e falharia pra sempre (not_authenticated) até o usuário recarregar a
// página manualmente. Criança/Contato usam token de dispositivo fixo, mas
// passam pelo mesmo formato por uniformidade -- custo zero.
export type AuthResolver = () => Promise<SignalingAuth | null>;

let socket: Socket | null = null;
let currentKey: string | null = null;

/**
 * Devolve o socket de sinalização já conectado (cria/reconecta se preciso).
 * Singleton por aba -- todas as telas que precisam de chamada (header do
 * chat, overlay de chamada recebida) compartilham a mesma conexão via
 * useCall (ver hooks/use-call.ts), em vez de cada uma abrir a sua.
 *
 * `key` identifica a IDENTIDADE (estável entre reconexões -- ex:
 * "parent", ou "child:<token>"), não o token em si, e decide se reaproveita
 * o socket existente. `resolveAuth` é reinvocado a cada tentativa de
 * conexão, sempre buscando um valor fresco.
 */
export function connectSignaling(key: string, resolveAuth: AuthResolver): Socket {
  if (socket && currentKey === key) return socket;

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  currentKey = key;
  socket = io(API_URL, {
    path: "/socket.io",
    // Forma de função (não objeto fixo): o socket.io chama isso de novo em
    // cada tentativa de conexão, o que é o mecanismo documentado pra lidar
    // com token que expira.
    auth: (cb: (data: SignalingAuth | Record<string, never>) => void) => {
      resolveAuth()
        .then((auth) => cb(auth ?? {}))
        .catch(() => cb({}));
    },
    autoConnect: true,
    reconnection: true,
  });
  return socket;
}

export function disconnectSignaling(): void {
  socket?.disconnect();
  socket = null;
  currentKey = null;
}
