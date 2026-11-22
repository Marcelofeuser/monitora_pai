import { clerkClient } from "@clerk/express";
import { and, eq, inArray, ne, or } from "drizzle-orm";
import {
  db,
  usersTable,
  childGuardiansTable,
  conversationsTable,
  messagesTable,
  mirrorLogTable,
  groupsTable,
  groupMessagesTable,
  contactsTable,
  childLocksTable,
  pairingTokensTable,
  contactInviteTokensTable,
  guardianInviteTokensTable,
  vouchersTable,
  subscriptionsTable,
} from "@workspace/db";
import { getGuardianChildIds } from "./guardians";
import { logger } from "./logger";

const STRIPE_VERSION = "2026-03-25.dahlia";

export class AccountDeletionBlockedError extends Error {}

export type AccountDeletionResult = {
  deletedChildIds: string[];
  keptChildIds: string[];
  canceledStripeSubscriptions: number;
};

/**
 * Exclusão de conta do Responsável (exigência App Store 5.1.1(v) e Google Play).
 *
 * Regras:
 *  - Crianças em que ele é o ÚNICO responsável são apagadas junto (com
 *    mensagens, localização, contatos, grupos — via cascade).
 *  - Crianças que têm outro responsável continuam existindo; a posse
 *    (usersTable.parentId / role owner) passa para outro responsável.
 *  - Assinaturas Stripe ativas são canceladas imediatamente.
 *  - Por último a conta de login (Clerk) é apagada.
 * Idempotente: se o Clerk falhar depois do banco, chamar de novo termina o serviço.
 */
export async function deleteParentAccount(parentId: string): Promise<AccountDeletionResult> {
  const [me] = await db.select({ id: usersTable.id, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, parentId)).limit(1);
  if (me && me.role !== "parent") throw new AccountDeletionBlockedError("not_a_parent_account");

  let result: AccountDeletionResult = { deletedChildIds: [], keptChildIds: [], canceledStripeSubscriptions: 0 };

  if (me) {
    const [voucher] = await db.select({ id: vouchersTable.id }).from(vouchersTable).where(eq(vouchersTable.createdBy, parentId)).limit(1);
    if (voucher) throw new AccountDeletionBlockedError("admin_account_has_vouchers");

    // 1) Cancela assinaturas Stripe ativas ANTES de apagar (depois perdemos o id).
    const subs = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.parentUserId, parentId));
    for (const sub of subs) {
      if (!sub.stripeSubscriptionId || sub.status === "canceled") continue;
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        // Sem chave neste ambiente: não dá para cancelar; registra para tratar manualmente.
        logger.warn({ parentId, stripeSubscriptionId: sub.stripeSubscriptionId }, "stripe key missing; subscription not canceled on account deletion");
        continue;
      }
      const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(sub.stripeSubscriptionId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${key}`, "Stripe-Version": STRIPE_VERSION },
      });
      // 404 = já não existe no Stripe; segue.
      if (!response.ok && response.status !== 404) {
        const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "stripe_cancel_failed");
      }
      result.canceledStripeSubscriptions += 1;
    }

    // 2) Separa crianças: só eu (apagar) x têm outro responsável (manter).
    const childIds = await getGuardianChildIds(parentId);
    const deleteChildIds: string[] = [];
    const keepChildren: { childId: string; heirId: string }[] = [];
    for (const childId of childIds) {
      const [other] = await db
        .select({ parentId: childGuardiansTable.parentId })
        .from(childGuardiansTable)
        .where(and(eq(childGuardiansTable.childId, childId), ne(childGuardiansTable.parentId, parentId)))
        .limit(1);
      if (other) keepChildren.push({ childId, heirId: other.parentId });
      else deleteChildIds.push(childId);
    }
    const doomed = [parentId, ...deleteChildIds];

    await db.transaction(async (tx) => {
      // 3) Crianças mantidas: passa posse e autoria para outro responsável.
      for (const { childId, heirId } of keepChildren) {
        await tx.update(usersTable).set({ parentId: heirId }).where(and(eq(usersTable.id, childId), eq(usersTable.parentId, parentId)));
        await tx.update(childGuardiansTable).set({ role: "owner" }).where(and(eq(childGuardiansTable.childId, childId), eq(childGuardiansTable.parentId, heirId)));
        await tx.update(groupsTable).set({ createdByParentId: heirId }).where(and(eq(groupsTable.childId, childId), eq(groupsTable.createdByParentId, parentId)));
        await tx.update(childLocksTable).set({ lockedByParentId: heirId }).where(and(eq(childLocksTable.childId, childId), eq(childLocksTable.lockedByParentId, parentId)));
      }

      // 4) Referências sem cascade que apontam para quem vai ser apagado.
      await tx.delete(conversationsTable).where(or(inArray(conversationsTable.participantAId, doomed), inArray(conversationsTable.participantBId, doomed)));
      await tx.delete(messagesTable).where(inArray(messagesTable.senderId, doomed));
      await tx.delete(mirrorLogTable).where(inArray(mirrorLogTable.mirroredToParentId, doomed));
      await tx.delete(groupMessagesTable).where(inArray(groupMessagesTable.senderId, doomed));
      await tx.delete(groupsTable).where(inArray(groupsTable.createdByParentId, doomed));
      await tx.delete(childLocksTable).where(inArray(childLocksTable.lockedByParentId, doomed));
      await tx.update(contactsTable).set({ contactUserId: null }).where(inArray(contactsTable.contactUserId, doomed));
      await tx.update(pairingTokensTable).set({ resultingChildUserId: null }).where(inArray(pairingTokensTable.resultingChildUserId, doomed));
      await tx.update(contactInviteTokensTable).set({ resultingContactUserId: null }).where(inArray(contactInviteTokensTable.resultingContactUserId, doomed));
      await tx.update(guardianInviteTokensTable).set({ resultingParentId: null }).where(inArray(guardianInviteTokensTable.resultingParentId, doomed));

      // 5) Apaga crianças (só minhas) e o Responsável. O resto sai por cascade:
      //    child_guardians, subscriptions, locations, device tokens, screen time,
      //    contatos/grupos da criança, calls, notificações, convites.
      await tx.delete(usersTable).where(inArray(usersTable.id, doomed));
    });

    result = { ...result, deletedChildIds: deleteChildIds, keptChildIds: keepChildren.map((k) => k.childId) };
  }

  // 6) Conta de login. 404 = já apagada.
  try {
    await clerkClient.users.deleteUser(parentId);
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status !== 404) throw err;
  }

  logger.info({ parentId, ...result }, "parent account deleted");
  return result;
}
