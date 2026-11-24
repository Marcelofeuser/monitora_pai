import { and, eq, inArray } from "drizzle-orm";
import { db, messagesTable, groupMessagesTable, messageReactionsTable, conversationsTable, groupsTable, groupMembersTable, contactsTable } from "@workspace/db";
import { isGuardianOfChild } from "./guardians";

// 1.1 do chat: reações com emoji e "responder" mensagem específica.
// Este módulo concentra a lógica pra não duplicar nas ~10 rotas de chat
// (Responsável / Criança / Contato × conversa 1:1 / grupo).

export type ChatScope = "direct" | "group";

/** Lista fechada (segurança infantil: sem emoji livre em reação). */
export const ALLOWED_REACTIONS = ["❤️", "😂", "😮", "😢", "🙏", "👍"] as const;

export function isAllowedReaction(emoji: string): boolean {
  return (ALLOWED_REACTIONS as readonly string[]).includes(emoji);
}

export type ReplyPreview = {
  id: string;
  senderId: string;
  type: string;
  textContent: string | null;
  /** true quando a citada é figurinha (contentUrl "emoji:..."). */
  sticker: string | null;
};

type BaseMessage = {
  id: string;
  senderId: string;
  type: string;
  textContent: string | null;
  contentUrl: string | null;
  replyToMessageId?: string | null;
};

function preview(row: BaseMessage): ReplyPreview {
  const sticker = row.contentUrl?.startsWith("emoji:") ? row.contentUrl.slice("emoji:".length) : null;
  const text = row.textContent ? row.textContent.slice(0, 160) : null;
  return { id: row.id, senderId: row.senderId, type: row.type, textContent: text, sticker };
}

/**
 * Anexa `reactions` ([{ emoji, userId }]) e `replyTo` (prévia da mensagem
 * citada ou null) a cada mensagem. Duas consultas extras no total, não por mensagem.
 */
export async function withChatExtras<T extends BaseMessage>(
  rows: T[],
  scope: ChatScope,
): Promise<Array<T & { reactions: Array<{ emoji: string; userId: string }>; replyTo: ReplyPreview | null }>> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const byId = new Map(rows.map((r) => [r.id, r]));

  const reactionRows = await db
    .select({
      messageId: messageReactionsTable.messageId,
      groupMessageId: messageReactionsTable.groupMessageId,
      emoji: messageReactionsTable.emoji,
      userId: messageReactionsTable.userId,
    })
    .from(messageReactionsTable)
    .where(
      scope === "direct"
        ? inArray(messageReactionsTable.messageId, ids)
        : inArray(messageReactionsTable.groupMessageId, ids),
    );
  const reactionsByMessage = new Map<string, Array<{ emoji: string; userId: string }>>();
  for (const r of reactionRows) {
    const key = (scope === "direct" ? r.messageId : r.groupMessageId) as string;
    const list = reactionsByMessage.get(key) ?? [];
    list.push({ emoji: r.emoji, userId: r.userId });
    reactionsByMessage.set(key, list);
  }

  // Citadas que não estão na página atual (raro: histórico é carregado inteiro hoje).
  const missing = [...new Set(rows.map((r) => r.replyToMessageId).filter((id): id is string => !!id && !byId.has(id)))];
  const extra = new Map<string, BaseMessage>();
  if (missing.length > 0) {
    const table = scope === "direct" ? messagesTable : groupMessagesTable;
    const found = await db
      .select({ id: table.id, senderId: table.senderId, type: table.type, textContent: table.textContent, contentUrl: table.contentUrl })
      .from(table)
      .where(inArray(table.id, missing));
    for (const f of found) extra.set(f.id, f);
  }

  return rows.map((row) => {
    const target = row.replyToMessageId ? byId.get(row.replyToMessageId) ?? extra.get(row.replyToMessageId) : undefined;
    return {
      ...row,
      reactions: reactionsByMessage.get(row.id) ?? [],
      replyTo: target ? preview(target) : null,
    };
  });
}

/** Lê `replyToMessageId` do corpo (JSON ou multipart). */
export function readReplyId(body: unknown): string | null {
  const raw = (body as Record<string, unknown> | undefined)?.replyToMessageId;
  if (typeof raw !== "string") return null;
  const id = raw.trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/**
 * Só aceita citar mensagem da MESMA conversa/grupo (não deixa vazar
 * conteúdo de outra conversa). Inválido vira null — a mensagem é enviada
 * normalmente, só sem citação.
 */
export async function resolveReplyTo(scope: ChatScope, containerId: string, replyId: string | null): Promise<string | null> {
  if (!replyId) return null;
  if (scope === "direct") {
    const [row] = await db
      .select({ id: messagesTable.id })
      .from(messagesTable)
      .where(and(eq(messagesTable.id, replyId), eq(messagesTable.conversationId, containerId)))
      .limit(1);
    return row?.id ?? null;
  }
  const [row] = await db
    .select({ id: groupMessagesTable.id })
    .from(groupMessagesTable)
    .where(and(eq(groupMessagesTable.id, replyId), eq(groupMessagesTable.groupId, containerId)))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Quem pode reagir: participante da conversa 1:1, ou membro do grupo
 * (Responsável da criança, a própria criança, contato conectado).
 * O Responsável vendo o ESPELHO (conversa criança↔contato) não é
 * participante — espelho é só leitura, não reage.
 */
export async function canReact(userId: string, scope: ChatScope, messageId: string): Promise<boolean> {
  if (scope === "direct") {
    const [row] = await db
      .select({ a: conversationsTable.participantAId, b: conversationsTable.participantBId })
      .from(messagesTable)
      .innerJoin(conversationsTable, eq(messagesTable.conversationId, conversationsTable.id))
      .where(eq(messagesTable.id, messageId))
      .limit(1);
    return !!row && (row.a === userId || row.b === userId);
  }
  const [row] = await db
    .select({ groupId: groupsTable.id, childId: groupsTable.childId })
    .from(groupMessagesTable)
    .innerJoin(groupsTable, eq(groupMessagesTable.groupId, groupsTable.id))
    .where(eq(groupMessagesTable.id, messageId))
    .limit(1);
  if (!row) return false;
  if (row.childId === userId) return true;
  if (await isGuardianOfChild(userId, row.childId)) return true;
  const [member] = await db
    .select({ id: groupMembersTable.id })
    .from(groupMembersTable)
    .innerJoin(contactsTable, eq(groupMembersTable.contactId, contactsTable.id))
    .where(and(eq(groupMembersTable.groupId, row.groupId), eq(contactsTable.contactUserId, userId)))
    .limit(1);
  return !!member;
}

/** Define (ou remove, com emoji null) a reação do usuário. */
export async function setReaction(userId: string, scope: ChatScope, messageId: string, emoji: string | null): Promise<void> {
  const target = scope === "direct" ? messageReactionsTable.messageId : messageReactionsTable.groupMessageId;
  await db.transaction(async (tx) => {
    await tx.delete(messageReactionsTable).where(and(eq(target, messageId), eq(messageReactionsTable.userId, userId)));
    if (emoji) {
      await tx.insert(messageReactionsTable).values({
        userId,
        emoji,
        messageId: scope === "direct" ? messageId : null,
        groupMessageId: scope === "group" ? messageId : null,
      });
    }
  });
}
