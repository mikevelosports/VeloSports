import { Request, Response, NextFunction } from "express";

export function errorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  console.error(err);

  const status = err.status || 500;
  const message =
    err.message || "An unexpected error occurred. Please try again.";

  res.status(status).json({
    error: message
  });
}
