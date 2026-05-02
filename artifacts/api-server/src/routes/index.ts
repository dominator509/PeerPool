import { Router, type IRouter } from "express";
import healthRouter from "./health";
import escrowsRouter from "./escrows";
import manifestsRouter from "./manifests";
import participantsRouter from "./participants";
import votesRouter from "./votes";
import disputesRouter from "./disputes";
import claimsRouter from "./claims";
import activityRouter from "./activity";
import statsRouter from "./stats";

const router: IRouter = Router();

router.use(healthRouter);
router.use(escrowsRouter);
router.use(manifestsRouter);
router.use(participantsRouter);
router.use(votesRouter);
router.use(disputesRouter);
router.use(claimsRouter);
router.use(activityRouter);
router.use(statsRouter);

export default router;
