import express from "express";
import cors from "cors";
import { ENV } from "./config/env";
import routes from "./routes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api", routes);

// Error handler last
app.use(errorHandler);

app.listen(ENV.port, () => {
  console.log(`Velo backend listening on port ${ENV.port}`);
});
