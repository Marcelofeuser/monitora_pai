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

let socket: Socket | null = null;
let currentAuthKey: string | null = null;

function authKey(auth: SignalingAuth): string {
  return "clerkToken" in auth
    ? `parent:${auth.clerkToken}`
    : "childToken" in auth
      ? `child:${auth.childToken}`
      : `contact:${auth.contactToken}`;
}

/**
 * Devolve o socket de sinalização já conectado (cria/reconecta se preciso).
 * Singleton por aba -- todas as telas que precisam de chamada (header do
 * chat, overlay de chamada recebida) compartilham a mesma conexão via
 * useCall (ver hooks/use-call.ts), em vez de cada uma abrir a sua.
 */
export function connectSignaling(auth: SignalingAuth): Socket {
  const key = authKey(auth);
  if (socket && currentAuthKey === key) return socket;

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  currentAuthKey = key;
  socket = io(API_URL, {
    path: "/socket.io",
    auth,
    autoConnect: true,
    reconnection: true,
  });
  return socket;
}

export function disconnectSignaling(): void {
  socket?.disconnect();
  socket = null;
  currentAuthKey = null;
}
