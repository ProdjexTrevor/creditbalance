import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { jwtSecret } from "../lib/env.js";

export type AuthUser = {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
};

type Pending2faPayload = {
  purpose: "2fa";
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

const JWT_OPTS = { algorithms: ["HS256"] as jwt.Algorithm[] };

export function signToken(user: AuthUser): string {
  return jwt.sign({ ...user, purpose: "session" }, jwtSecret(), {
    expiresIn: "12h",
    algorithm: "HS256",
  });
}

/** Short-lived token after password OK when TOTP is enabled */
export function signPending2faToken(user: AuthUser): string {
  const payload: Pending2faPayload = {
    purpose: "2fa",
    id: user.id,
    tenantId: user.tenantId,
    email: user.email,
    role: user.role,
  };
  return jwt.sign(payload, jwtSecret(), { expiresIn: "5m", algorithm: "HS256" });
}

export function verifyPending2faToken(token: string): Pending2faPayload | null {
  try {
    const payload = jwt.verify(token, jwtSecret(), JWT_OPTS) as Pending2faPayload & {
      purpose?: string;
    };
    if (payload.purpose !== "2fa" || !payload.id) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const payload = jwt.verify(header.slice(7), jwtSecret(), JWT_OPTS) as AuthUser & {
      purpose?: string;
    };
    if (payload.purpose !== "session" || !payload.id) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      select: {
        id: true,
        tenantId: true,
        email: true,
        role: true,
        active: true,
      },
    });
    if (!user || !user.active || user.tenantId !== payload.tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = {
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
