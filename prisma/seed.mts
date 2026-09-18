// Creates (or promotes) the first coordinator. Idempotent.
//
//   SEED_COORDINATOR_EMAIL=nome@dominio.gov.br npm run db:seed
//   SEED_COORDINATOR_NAME="Nome Completo"      (optional)
//
// Runs with plain Node (type stripping), so it imports no project aliases.
import prismaClient from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const { PrismaClient, Role } = prismaClient;

const email = process.env.SEED_COORDINATOR_EMAIL?.trim().toLowerCase();

if (!email || !email.includes("@")) {
  console.error("Defina SEED_COORDINATOR_EMAIL com um e-mail valido.");
  process.exit(1);
}

const name = process.env.SEED_COORDINATOR_NAME?.trim() || email;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

try {
  // Directory e-mails may be stored in any case.
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { role: Role.COORDINATOR, isActive: true, isGuest: false },
    });
    console.log(`Usuario existente promovido a coordenador: ${existing.email}`);
  } else {
    await prisma.user.create({
      data: {
        email,
        login: email,
        name,
        department: "",
        role: Role.COORDINATOR,
      },
    });
    console.log(`Coordenador criado: ${email}`);
  }
} finally {
  await prisma.$disconnect();
  await pool.end();
}
