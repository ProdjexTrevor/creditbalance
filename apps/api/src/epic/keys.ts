import { createPrivateKey, createPublicKey } from "node:crypto";
import { exportJWK, generateKeyPair, exportPKCS8 } from "jose";

export const DEFAULT_EPIC_KID = "credit-balance-sandbox";

export type GeneratedEpicKeyPair = {
  kid: string;
  privateKeyPem: string;
  publicJwk: Record<string, unknown>;
  jwks: { keys: Record<string, unknown>[] };
};

/** Generate RS384-capable RSA keypair for Epic backend OAuth. */
export async function generateEpicKeyPair(
  kid = DEFAULT_EPIC_KID
): Promise<GeneratedEpicKeyPair> {
  const { privateKey, publicKey } = await generateKeyPair("RS384", {
    modulusLength: 2048,
    extractable: true,
  });
  const privateKeyPem = await exportPKCS8(privateKey);
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = kid;
  publicJwk.alg = "RS384";
  publicJwk.use = "sig";
  return {
    kid,
    privateKeyPem,
    publicJwk,
    jwks: { keys: [publicJwk] },
  };
}

/** Build a public JWK from a PKCS#8 or RSA private PEM. */
export function publicJwkFromPrivatePem(
  privateKeyPem: string,
  kid: string
): Record<string, unknown> {
  const keyObject = createPrivateKey(privateKeyPem);
  const pub = createPublicKey(keyObject);
  const jwk = pub.export({ format: "jwk" }) as Record<string, unknown>;
  jwk.kid = kid;
  jwk.alg = "RS384";
  jwk.use = "sig";
  delete jwk.d;
  delete jwk.p;
  delete jwk.q;
  delete jwk.dp;
  delete jwk.dq;
  delete jwk.qi;
  return jwk;
}
