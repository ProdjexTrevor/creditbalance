#!/usr/bin/env node
/**
 * Vercel build — generate Prisma client only.
 * Vercel's Express preset bundles src/index.ts; we do NOT run tsc here.
 */
import { execSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "mysql://build:build@127.0.0.1:3306/credit_balance_build";
}

console.log("→ prisma generate");
execSync("pnpm exec prisma generate", { stdio: "inherit" });

console.log("→ vercel-build complete");
