#!/usr/bin/env node
/**
 * Vercel build for pnpm monorepo (Root Directory = apps/api).
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(apiDir, "..", "..");
const monorepo = existsSync(join(repoRoot, "pnpm-lock.yaml"));

process.env.DATABASE_URL ??=
  "mysql://build:build@127.0.0.1:3306/credit_balance_build";

function run(cmd, cwd) {
  console.log(`→ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", env: process.env });
}

function hasNodeModules(dir) {
  return existsSync(join(dir, "node_modules"));
}

if (monorepo) {
  if (!hasNodeModules(repoRoot)) {
    run("pnpm install --no-frozen-lockfile", repoRoot);
  }
  run("pnpm --filter api exec prisma generate", repoRoot);
} else {
  if (!hasNodeModules(apiDir)) {
    run("pnpm install --no-frozen-lockfile", apiDir);
  }
  run("pnpm exec prisma generate", apiDir);
}

console.log("→ vercel-build complete");
