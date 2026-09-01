import { createRequire } from "node:module";
import type { RequestHandler } from "express";

const require = createRequire(import.meta.url);

/** CJS middleware factory (helmet, express-rate-limit, etc.) */
export type MiddlewareFactory = (options?: object) => RequestHandler;

/** Load a CJS Express middleware — avoids Vercel/NodeNext default-import TS2349 errors. */
export function loadCjsMiddleware<T extends MiddlewareFactory>(id: string): T {
  return require(id) as T;
}

export const helmet = loadCjsMiddleware<MiddlewareFactory>("helmet");
export const rateLimit = loadCjsMiddleware<MiddlewareFactory>("express-rate-limit");
