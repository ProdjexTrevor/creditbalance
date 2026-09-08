/**
 * Set Vercel env vars without the trailing newline PowerShell pipes add.
 * Usage: node scripts/set-vercel-env.mjs
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pulled = path.join(apiDir, ".env.prod");

function sanitize(value) {
  if (value == null) return undefined;
  let v = String(value).trim().replace(/^["']|["']$/g, "");
  v = v.replace(/(\\r\\n|\\n|\r\n|\n|\r)+$/g, "").trim();
  return v || undefined;
}

function readPulled() {
  if (!fs.existsSync(pulled)) return {};
  const out = {};
  for (const line of fs.readFileSync(pulled, "utf8").split(/\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let raw = m[2];
    if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
    out[m[1]] = sanitize(raw.replace(/\\r\\n/g, "\r\n").replace(/\\n/g, "\n"));
  }
  return out;
}

const vercelCmd = process.platform === "win32" ? "vercel.cmd" : "vercel";

function setEnv(name, value, environment) {
  // Remove first (ignore errors)
  try {
    execFileSync(
      vercelCmd,
      ["env", "rm", name, environment, "--yes", "--scope", "prodjex"],
      { stdio: "pipe", shell: true }
    );
  } catch {
    /* missing is fine */
  }
  execFileSync(
    vercelCmd,
    ["env", "add", name, environment, "--scope", "prodjex"],
    { input: value, stdio: ["pipe", "inherit", "inherit"], shell: true }
  );
  console.log(`set ${name} (${environment}) len=${value.length}`);
}

const existing = readPulled();
const jwt =
  existing.JWT_SECRET && existing.JWT_SECRET.length >= 32
    ? existing.JWT_SECRET
    : randomBytes(32).toString("base64url");
const totp =
  existing.TOTP_ENCRYPTION_KEY &&
  existing.TOTP_ENCRYPTION_KEY.length >= 32 &&
  existing.TOTP_ENCRYPTION_KEY !== jwt
    ? existing.TOTP_ENCRYPTION_KEY
    : randomBytes(32).toString("base64url");
const databaseUrl = existing.DATABASE_URL;
const webOrigin = sanitize(existing.WEB_ORIGIN) || "http://localhost:5173";

if (!databaseUrl) {
  console.error("DATABASE_URL missing from .env.prod — pull first");
  process.exit(1);
}

for (const environment of ["production", "preview", "development"]) {
  setEnv("JWT_SECRET", jwt, environment);
  setEnv("TOTP_ENCRYPTION_KEY", totp, environment);
  setEnv("DATABASE_URL", databaseUrl, environment);
  setEnv("WEB_ORIGIN", webOrigin, environment);
}

console.log("done — redeploy for new env to apply");
