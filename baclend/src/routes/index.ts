import { Router } from "express";
import healthRoutes from "./health.routes";

const router = Router();

router.use(healthRoutes);

// Later we’ll do things like:
// router.use("/profiles", profileRoutes);
// router.use("/sessions", sessionRoutes);
// router.use("/protocols", protocolRoutes);

export default router;
