import { PrismaClient, Role } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await argon2.hash('AdminPassword123!', {
    type: argon2.argon2id,
  });

  const userPassword = await argon2.hash('UserPassword123!', {
    type: argon2.argon2id,
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@starter.dev' },
    update: {},
    create: {
      email: 'admin@starter.dev',
      passwordHash: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: Role.ADMIN,
      isActive: true,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: 'user@starter.dev' },
    update: {},
    create: {
      email: 'user@starter.dev',
      passwordHash: userPassword,
      firstName: 'Regular',
      lastName: 'User',
      role: Role.USER,
      isActive: true,
    },
  });

  // Safe logging during seed
  process.stdout.write(
    `Database seeded successfully:\n- Admin: ${admin.email}\n- User: ${user.email}\n`
  );
}

main()
  .catch((e) => {
    process.stderr.write(`Error during seed: ${e instanceof Error ? e.message : String(e)}\n`);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
