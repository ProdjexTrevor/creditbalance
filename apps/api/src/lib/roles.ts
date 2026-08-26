import type { UserRole } from "@prisma/client";

/** Tenant-level admins (all clients in tenant). */
export const TENANT_ADMIN_ROLES: UserRole[] = ["SUPER_ADMIN", "TENANT_ADMIN"];

/** Facility admins + tenant admins (config, maps, Epic, import). */
export const ADMIN_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "CLIENT_ADMIN",
];

/** Can mutate accounts / run hierarchy (not VIEWER). */
export const WRITE_ROLES: UserRole[] = [
  "SUPER_ADMIN",
  "TENANT_ADMIN",
  "CLIENT_ADMIN",
  "ANALYST",
];

export function isTenantAdmin(role: UserRole): boolean {
  return TENANT_ADMIN_ROLES.includes(role);
}

export function isAdmin(role: UserRole): boolean {
  return ADMIN_ROLES.includes(role);
}
