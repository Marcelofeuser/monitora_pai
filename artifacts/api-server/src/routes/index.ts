import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pairingRouter from "./pairing";
import contactsRouter from "./contacts";
import messagesRouter from "./messages";
import locationRouter from "./location";
import migrateLocationRouter from "./migrateLocation";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pairingRouter);
router.use(contactsRouter);
router.use(messagesRouter);
router.use(locationRouter);
router.use(migrateLocationRouter);

export default router;
