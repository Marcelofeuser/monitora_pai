import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pairingRouter from "./pairing";
import contactsRouter from "./contacts";
import messagesRouter from "./messages";
import clerkDebugRouter from "./clerkDebug";
import dbResetRouter from "./dbReset";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pairingRouter);
router.use(contactsRouter);
router.use(messagesRouter);
// DIAGNÓSTICO/MIGRAÇÃO TEMPORÁRIA — remover junto com src/routes/clerkDebug.ts
// e src/routes/dbReset.ts depois de confirmar que /api/pairing funciona.
router.use(clerkDebugRouter);
router.use(dbResetRouter);

export default router;
