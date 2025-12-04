import { Router } from "express";
import healthRoutes from "./health.routes";
import profileRoutes from "./profile.routes";
import protocolRoutes from "./protocol.routes";
import sessionRoutes from "./session.routes";
import statsRouter from "./stats.routes";
import programStateRoutes from "./programState.routes";

const router = Router();

router.use(healthRoutes);
router.use(profileRoutes);
router.use(protocolRoutes);
router.use(sessionRoutes);
router.use(statsRouter);
router.use(programStateRoutes);

export default router;
