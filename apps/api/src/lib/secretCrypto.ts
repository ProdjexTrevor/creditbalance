import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { encryptionSecret } from "./env.js";

function encKey(): Buffer {
  return createHash("sha256").update(encryptionSecret()).digest();
}

/** Encrypt sensitive strings at rest (AES-256-GCM). */
export function encryptAtRest(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptAtRest(payload: string): string {
  const [ver, ivB64, tagB64, dataB64] = payload.split(":");
  if (ver !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Invalid encrypted payload");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encKey(),
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
