import { Router, type IRouter } from "express";
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
import guardiansRouter from "./guardians";
import callsRouter from "./calls";
import devicesRouter from "./devices";
import adminRouter from "./admin";
import billingRouter from "./billing";

const router: IRouter = Router();

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
router.use(guardiansRouter);
router.use(callsRouter);
router.use(devicesRouter);
router.use("/admin", adminRouter);
router.use("/billing", billingRouter);

export default router;
