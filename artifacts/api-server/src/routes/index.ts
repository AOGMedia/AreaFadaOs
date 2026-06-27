import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import dashboardRouter from "./dashboard";
import schedulingRouter from "./scheduling";
import monetizationRouter from "./monetization";
import analyticsRouter from "./analytics";
import ambassadorsRouter from "./ambassadors";
import bookPromoRouter from "./book-promo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(dashboardRouter);
router.use(schedulingRouter);
router.use(monetizationRouter);
router.use(analyticsRouter);
router.use(ambassadorsRouter);
router.use(bookPromoRouter);

export default router;
