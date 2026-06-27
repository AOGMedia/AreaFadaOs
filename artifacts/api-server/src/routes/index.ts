import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import dashboardRouter from "./dashboard";
import schedulingRouter from "./scheduling";
import monetizationRouter from "./monetization";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(dashboardRouter);
router.use(schedulingRouter);
router.use(monetizationRouter);

export default router;
