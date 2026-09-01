#!/usr/bin/env node
/** Generate Prisma client — install is handled by vercel.json installCommand. */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(apiDir, "..", "..");

process.env.DATABASE_URL ??=
  "mysql://build:build@127.0.0.1:3306/credit_balance_build";

function run(cmd, cwd) {
  console.log(`→ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", env: process.env });
}

if (existsSync(join(repoRoot, "pnpm-lock.yaml"))) {
  run("pnpm --filter api exec prisma generate", repoRoot);
} else {
  // CLI-only upload (no monorepo) — npx fetches prisma CLI
  run("npx prisma@5.22.0 generate", apiDir);
}

console.log("→ vercel-build complete");
