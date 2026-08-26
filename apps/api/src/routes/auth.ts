import { Router } from "express";
import bcrypt from "bcryptjs";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  requireAuth,
  signPending2faToken,
  signToken,
  verifyPending2faToken,
} from "../middleware/auth.js";
import {
  consumeBackupCode,
  createTotpSecret,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  hashBackupCodes,
  totpUri,
  verifyTotpCode,
} from "../lib/totp.js";

export const authRouter = Router();

/** bcrypt hash used only to equalize login timing when user/tenant missing */
const DUMMY_PASSWORD_HASH =
  "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantSlug: z.string().min(1),
});

async function clientsForUser(userId: string) {
  const clients = await prisma.userClientAccess.findMany({
    where: { userId },
    include: { client: true },
  });
  return clients.map((c) => ({
    id: c.client.id,
    name: c.client.name,
    code: c.client.code,
  }));
}

function publicUser(
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    totpEnabled?: boolean;
  },
  tenant: { id: string; name: string; slug: string }
) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    totpEnabled: Boolean(user.totpEnabled),
  };
}

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }
  const { email, password, tenantSlug } = parsed.data;

  const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug } });
  if (!tenant || !tenant.active) {
    // Constant-time-ish: still do a dummy compare when tenant missing
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const user = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: tenant.id, email } },
  });
  if (!user || !user.active) {
    await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  if (user.totpEnabled && user.totpSecret) {
    const pendingToken = signPending2faToken({
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    });
    return res.json({
      requires2fa: true,
      pendingToken,
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  }

  const token = signToken({
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  });

  res.json({
    requires2fa: false,
    token,
    user: publicUser(user, tenant),
    clients: await clientsForUser(user.id),
  });
});

const twoFaLoginSchema = z.object({
  pendingToken: z.string().min(1),
  code: z.string().min(4).max(32),
});

authRouter.post("/login/2fa", async (req, res) => {
  const parsed = twoFaLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const pending = verifyPending2faToken(parsed.data.pendingToken);
  if (!pending) {
    return res.status(401).json({ error: "Session expired. Sign in again." });
  }

  const user = await prisma.user.findUnique({ where: { id: pending.id } });
  if (!user || !user.active || !user.totpEnabled || !user.totpSecret) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
  if (!tenant || !tenant.active) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  let secretPlain: string;
  try {
    secretPlain = decryptSecret(user.totpSecret);
  } catch {
    return res.status(500).json({ error: "Two-factor configuration error" });
  }

  const code = parsed.data.code.trim();
  const totpOk = verifyTotpCode(secretPlain, code);
  if (!totpOk) {
    const hashes = (user.totpBackupCodes as string[] | null) ?? null;
    const remaining = await consumeBackupCode(hashes, code);
    if (!remaining) {
      return res.status(401).json({ error: "Invalid authenticator or backup code" });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { totpBackupCodes: remaining },
    });
  }

  const token = signToken({
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  });

  res.json({
    token,
    user: publicUser(user, tenant),
    clients: await clientsForUser(user.id),
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
  if (!tenant) return res.status(401).json({ error: "Unauthorized" });

  res.json({
    user: publicUser(user, tenant),
    clients: await clientsForUser(user.id),
  });
});

authRouter.get("/2fa/status", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const backupCount = Array.isArray(user.totpBackupCodes)
    ? user.totpBackupCodes.length
    : 0;
  res.json({
    enabled: user.totpEnabled,
    backupCodesRemaining: backupCount,
  });
});

/** Start enrollment — returns QR + secret; not enabled until confirm */
authRouter.post("/2fa/setup", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
  if (!tenant) return res.status(401).json({ error: "Unauthorized" });

  if (user.totpEnabled) {
    return res.status(400).json({
      error: "Two-factor authentication is already enabled. Disable it first to reset.",
    });
  }

  const secret = createTotpSecret();
  const uri = totpUri(secret, user.email, tenant.slug);
  const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });

  await prisma.user.update({
    where: { id: user.id },
    data: { totpPendingSecret: encryptSecret(secret) },
  });

  res.json({
    secret,
    otpauthUrl: uri,
    qrDataUrl,
  });
});

const confirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

authRouter.post("/2fa/confirm", requireAuth, async (req, res) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Enter the 6-digit code from your authenticator app" });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.totpPendingSecret) {
    return res.status(400).json({ error: "Start setup first" });
  }

  let secretPlain: string;
  try {
    secretPlain = decryptSecret(user.totpPendingSecret);
  } catch {
    return res.status(500).json({ error: "Two-factor configuration error" });
  }

  if (!verifyTotpCode(secretPlain, parsed.data.code)) {
    return res.status(400).json({ error: "Invalid code. Try again." });
  }

  const backupCodes = generateBackupCodes(8);
  const hashed = await hashBackupCodes(backupCodes);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpEnabled: true,
      totpSecret: encryptSecret(secretPlain),
      totpPendingSecret: null,
      totpBackupCodes: hashed,
    },
  });

  res.json({
    enabled: true,
    backupCodes,
    message: "Save these backup codes now. They will not be shown again.",
  });
});

const disableSchema = z.object({
  password: z.string().min(1),
  code: z.string().min(4).max(32),
});

authRouter.post("/2fa/disable", requireAuth, async (req, res) => {
  const parsed = disableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(401).json({ error: "Unauthorized" });
  if (!user.totpEnabled || !user.totpSecret) {
    return res.status(400).json({ error: "Two-factor authentication is not enabled" });
  }

  const passwordOk = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ error: "Invalid password" });
  }

  let secretPlain: string;
  try {
    secretPlain = decryptSecret(user.totpSecret);
  } catch {
    return res.status(500).json({ error: "Two-factor configuration error" });
  }

  const code = parsed.data.code.trim();
  let ok = verifyTotpCode(secretPlain, code);
  if (!ok) {
    const remaining = await consumeBackupCode(
      (user.totpBackupCodes as string[] | null) ?? null,
      code
    );
    ok = remaining !== null;
  }
  if (!ok) {
    return res.status(401).json({ error: "Invalid authenticator or backup code" });
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      totpEnabled: false,
      totpSecret: null,
      totpPendingSecret: null,
      totpBackupCodes: [],
    },
  });

  res.json({ enabled: false });
});

const regenSchema = z.object({
  password: z.string().min(1),
  code: z.string().regex(/^\d{6}$/),
});

authRouter.post("/2fa/backup-codes", requireAuth, async (req, res) => {
  const parsed = regenSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Password and current 6-digit code required" });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.totpEnabled || !user.totpSecret) {
    return res.status(400).json({ error: "Enable two-factor authentication first" });
  }

  const passwordOk = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!passwordOk) {
    return res.status(401).json({ error: "Invalid password" });
  }

  let secretPlain: string;
  try {
    secretPlain = decryptSecret(user.totpSecret);
  } catch {
    return res.status(500).json({ error: "Two-factor configuration error" });
  }

  if (!verifyTotpCode(secretPlain, parsed.data.code)) {
    return res.status(401).json({ error: "Invalid authenticator code" });
  }

  const backupCodes = generateBackupCodes(8);
  const hashed = await hashBackupCodes(backupCodes);
  await prisma.user.update({
    where: { id: user.id },
    data: { totpBackupCodes: hashed },
  });

  res.json({
    backupCodes,
    message: "Previous backup codes are no longer valid. Save these now.",
  });
});

const profileSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
});

authRouter.patch("/profile", requireAuth, async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(parsed.error.flatten());
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      firstName: parsed.data.firstName.trim(),
      lastName: parsed.data.lastName.trim(),
    },
  });
  const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
  if (!tenant) return res.status(401).json({ error: "Unauthorized" });

  res.json({
    user: publicUser(user, tenant),
  });
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

authRouter.post("/profile/password", requireAuth, async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Current password and a new password (at least 8 characters) are required",
    });
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  res.json({ ok: true });
});
