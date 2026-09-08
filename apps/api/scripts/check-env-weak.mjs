import fs from "node:fs";

const text = fs.readFileSync(".env.prod", "utf8");

function sanitize(value) {
  if (value == null) return undefined;
  let v = value.trim().replace(/^["']|["']$/g, "");
  v = v.replace(/(\\r\\n|\\n|\r\n|\n|\r)+$/g, "").trim();
  return v || undefined;
}

function isWeak(value) {
  const WEAK = new Set([
    "",
    "dev-secret",
    "dev-secret-change-me",
    "dev-secret-local-only-do-not-use",
    "dev-enc-local-only-do-not-use",
    "change-me",
    "change-me-in-production",
    "change-me-totp",
    "change-me-epic",
    "password",
    "secret",
  ]);
  if (!value || value.trim().length < 16) return true;
  return WEAK.has(value.trim().toLowerCase());
}

for (const line of text.split(/\n/)) {
  const m = line.match(/^(JWT_SECRET|TOTP_ENCRYPTION_KEY|WEB_ORIGIN|DATABASE_URL)=(.*)$/);
  if (!m) continue;
  let raw = m[2];
  if (raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1);
  const asRuntime = raw.replace(/\\r\\n/g, "\r\n").replace(/\\n/g, "\n");
  const cleaned = sanitize(asRuntime);
  console.log(m[1], {
    rawLen: raw.length,
    cleanedLen: cleaned?.length,
    weak: isWeak(cleaned),
    tail: JSON.stringify(asRuntime.slice(-6)),
    cleanedTail: cleaned ? JSON.stringify(cleaned.slice(-6)) : null,
  });
}
