/**
 * Soften rate-limit validator for Vercel serverless (no persistent IP store needed).
 * Also avoid crashing the whole function if middleware factories resolve oddly.
 */
import type { RequestHandler } from "express";

type Factory = (opts?: object) => RequestHandler;

export function asMiddlewareFactory(mod: unknown): Factory {
  if (typeof mod === "function") return mod as Factory;
  if (mod && typeof (mod as { default?: unknown }).default === "function") {
    return (mod as { default: Factory }).default;
  }
  throw new Error("Expected Express middleware factory");
}
