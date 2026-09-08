/**
 * Minimal demo seed — tenant + admin user only (fast, safe to re-run).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("password123", 10);

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: { name: "Demo Hospital", active: true },
    create: { name: "Demo Hospital", slug: "demo", active: true },
  });

  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "admin@demo.local" } },
    update: {
      passwordHash,
      firstName: "Demo",
      lastName: "Admin",
      role: "TENANT_ADMIN",
      active: true,
      totpEnabled: false,
    },
    create: {
      tenantId: tenant.id,
      email: "admin@demo.local",
      passwordHash,
      firstName: "Demo",
      lastName: "Admin",
      role: "TENANT_ADMIN",
      active: true,
    },
  });

  console.log(
    JSON.stringify({
      ok: true,
      tenant: tenant.slug,
      user: user.email,
      login: { tenantSlug: "demo", email: "admin@demo.local", password: "password123" },
    })
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
