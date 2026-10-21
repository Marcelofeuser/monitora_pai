import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, isNull } from "drizzle-orm";
import { childDeviceTokensTable, db } from "@workspace/db";
import { isGuardianOfChild } from "../lib/guardians";
import { disconnectDeviceSockets } from "../signaling/revocation";

const router: IRouter = Router();

/**
 * GET /api/children/:childId/devices
 *
 * Lista os dispositivos vinculados a uma criança.
 * Nunca retorna tokenHash nem qualquer token de autenticação.
 */
router.get("/children/:childId/devices", async (req, res) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    return res.status(401).json({ error: "not_authenticated" });
  }

  const childId = req.params.childId;

  if (!(await isGuardianOfChild(auth.userId, childId))) {
    return res.status(403).json({ error: "not_authorized_for_child" });
  }

  const devices = await db
    .select({
      id: childDeviceTokensTable.id,
      createdAt: childDeviceTokensTable.createdAt,
      lastUsedAt: childDeviceTokensTable.lastUsedAt,
      revokedAt: childDeviceTokensTable.revokedAt,
    })
    .from(childDeviceTokensTable)
    .where(eq(childDeviceTokensTable.childId, childId))
    .orderBy(desc(childDeviceTokensTable.createdAt));

  return res.json({
    devices: devices.map((device) => ({
      ...device,
      status: device.revokedAt == null ? "active" : "revoked",
    })),
  });
});

/**
 * DELETE /api/children/:childId/devices/:deviceId
 *
 * Revoga somente o dispositivo selecionado.
 * Uma revogação já realizada não altera seu timestamp original.
 */
router.delete(
  "/children/:childId/devices/:deviceId",
  async (req, res) => {
    const auth = getAuth(req);
    if (!auth.userId) {
      return res.status(401).json({ error: "not_authenticated" });
    }

    const { childId, deviceId } = req.params;

    if (!(await isGuardianOfChild(auth.userId, childId))) {
      return res.status(403).json({ error: "not_authorized_for_child" });
    }

    const [device] = await db
      .select({
        id: childDeviceTokensTable.id,
        revokedAt: childDeviceTokensTable.revokedAt,
      })
      .from(childDeviceTokensTable)
      .where(
        and(
          eq(childDeviceTokensTable.id, deviceId),
          eq(childDeviceTokensTable.childId, childId),
        ),
      )
      .limit(1);

    if (!device) {
      return res.status(404).json({ error: "device_not_found" });
    }

    if (device.revokedAt != null) {
      // Garante a desconexao de eventuais sockets residuais.
      disconnectDeviceSockets(device.id);
      return res.json({
        ok: true,
        alreadyRevoked: true,
        revokedAt: device.revokedAt,
      });
    }

    const revokedAt = new Date();

    const [updated] = await db
      .update(childDeviceTokensTable)
      .set({ revokedAt })
      .where(
        and(
          eq(childDeviceTokensTable.id, deviceId),
          eq(childDeviceTokensTable.childId, childId),
          isNull(childDeviceTokensTable.revokedAt),
        ),
      )
      .returning({
        id: childDeviceTokensTable.id,
        revokedAt: childDeviceTokensTable.revokedAt,
      });

    // Outra solicitação pode ter revogado o dispositivo entre o SELECT
    // e o UPDATE. Nesse caso, não sobrescrevemos a primeira revogação.
    if (!updated) {
      const [current] = await db
        .select({
          id: childDeviceTokensTable.id,
          revokedAt: childDeviceTokensTable.revokedAt,
        })
        .from(childDeviceTokensTable)
        .where(
          and(
            eq(childDeviceTokensTable.id, deviceId),
            eq(childDeviceTokensTable.childId, childId),
          ),
        )
        .limit(1);

      if (!current) {
        return res.status(404).json({ error: "device_not_found" });
      }

      if (current.revokedAt != null) {
        // Garante a desconexao mesmo em uma corrida entre solicitacoes.
        disconnectDeviceSockets(current.id);
        return res.json({
          ok: true,
          alreadyRevoked: true,
          revokedAt: current.revokedAt,
        });
      }

      return res.status(409).json({ error: "device_revocation_conflict" });
    }

    // A revogação já foi confirmada no banco: encerra apenas os sockets
    // autenticados com o ID deste dispositivo, sem afetar outros aparelhos.
    disconnectDeviceSockets(updated.id);

    return res.json({
      ok: true,
      alreadyRevoked: false,
      revokedAt: updated.revokedAt,
    });
  },
);

export default router;
