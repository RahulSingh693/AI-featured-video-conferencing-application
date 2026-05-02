import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import meetingsRouter from "./meetings";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(meetingsRouter);
router.use(dashboardRouter);

export default router;
