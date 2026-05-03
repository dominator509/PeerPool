import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import escrowsRouter from "./escrows.js";
import manifestsRouter from "./manifests.js";
import participantsRouter from "./participants.js";
import votesRouter from "./votes.js";
import disputesRouter from "./disputes.js";
import claimsRouter from "./claims.js";
import activityRouter from "./activity.js";
import statsRouter from "./stats.js";
import aiRouter from "./ai.js";
import settlementRouter from "./settlement.js";
import chainsRouter from "./chains.js";
import klerosRouter from "./kleros.js";
import authRouter from "./auth.js";

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
router.use(aiRouter);
router.use(settlementRouter);
router.use(chainsRouter);
router.use(klerosRouter);
router.use(authRouter);

export default router;
