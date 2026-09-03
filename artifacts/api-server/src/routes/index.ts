import { Router, type IRouter } from "express";
import healthRouter from "./health";
import pairingRouter from "./pairing";
import contactsRouter from "./contacts";
import messagesRouter from "./messages";
import locationRouter from "./location";
import conversationsRouter from "./conversations";
import mediaRouter from "./media";
import notificationsRouter from "./notifications";
import screenTimeRouter from "./screenTime";
import groupsRouter from "./groups";
import meRouter from "./me";

const router: IRouter = Router();

router.use(healthRouter);
router.use(pairingRouter);
router.use(contactsRouter);
router.use(messagesRouter);
router.use(locationRouter);
router.use(conversationsRouter);
router.use(mediaRouter);
router.use(notificationsRouter);
router.use(screenTimeRouter);
router.use(groupsRouter);
router.use(meRouter);

export default router;
