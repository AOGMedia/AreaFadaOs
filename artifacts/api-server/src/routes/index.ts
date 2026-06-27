import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import dashboardRouter from "./dashboard";
import schedulingRouter from "./scheduling";
import monetizationRouter from "./monetization";
import analyticsRouter from "./analytics";
import ambassadorsRouter from "./ambassadors";
import bookPromoRouter from "./book-promo";
import liveVideoRouter from "./live-video";
import clipEngineRouter from "./clip-engine";
import autoPostRouter from "./auto-post";
import trafficRouter from "./traffic";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(dashboardRouter);
router.use(schedulingRouter);
router.use(monetizationRouter);
router.use(analyticsRouter);
router.use(ambassadorsRouter);
router.use(bookPromoRouter);
router.use(liveVideoRouter);
router.use(clipEngineRouter);
router.use(autoPostRouter);
router.use(trafficRouter);

export default router;
