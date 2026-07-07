/**
 * Global Express error-handler middleware.
 *
 * Must be registered LAST in the middleware chain (after all routes) so that
 * errors thrown or passed to next(err) from any route or middleware bubble up
 * here rather than crashing the process.
 *
 * Behaviour:
 *  - If the error carries a numeric `status` or `statusCode` property in the
 *    4xx range, that code is forwarded to the client (e.g. 400 Bad Request
 *    from a validation library).
 *  - All 5xx / unknown errors are normalised to 500 so internal details are
 *    never accidentally leaked.
 *  - The response is always JSON: { error: string }.
 *  - In non-production environments the `detail` field is also included so
 *    developers see the original error message without having to check logs.
 */

import type { Request, Response, NextFunction } from "express";

export interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

export function errorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const candidate = err.status ?? err.statusCode ?? 500;
  const statusCode = candidate >= 400 && candidate < 500 ? candidate : 500;

  const body: Record<string, unknown> = {
    error: statusCode < 500 ? (err.message || "Bad request") : "Internal server error",
  };

  if (process.env.NODE_ENV !== "production" && statusCode === 500 && err.message) {
    body.detail = err.message;
  }

  res.status(statusCode).json(body);
}
