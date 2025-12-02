import { Router } from "express";
import healthRoutes from "./health.routes";
import profileRoutes from "./profile.routes";
import protocolRoutes from "./protocol.routes";
import sessionRoutes from "./session.routes";

const router = Router();

router.use(healthRoutes);
router.use(profileRoutes);
router.use(protocolRoutes);
router.use(sessionRoutes);

export default router;
