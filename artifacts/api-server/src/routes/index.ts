import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pairingRouter from "./pairing";
import contactsRouter from "./contacts";
import messagesRouter from "./messages";
import clerkDebugRouter from "./clerkDebug";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pairingRouter);
router.use(contactsRouter);
router.use(messagesRouter);
// DIAGNÓSTICO TEMPORÁRIO — remover junto com src/routes/clerkDebug.ts depois
// de resolver o 401 not_authenticated.
router.use(clerkDebugRouter);

export default router;
