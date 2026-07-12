import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function bootstrap() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const name = process.env.BOOTSTRAP_ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    console.error('ERROR: BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be set in environment.');
    console.error('Usage:');
    console.error('  BOOTSTRAP_ADMIN_EMAIL=admin@example.com BOOTSTRAP_ADMIN_PASSWORD="very-strong-password" npx tsx src/bootstrap.ts');
    process.exit(1);
  }

  if (password.length < 10) {
    console.error('ERROR: Bootstrap admin password must be at least 10 characters.');
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (existing) {
    console.log(`User ${email} already exists. Updating password and role to SUPER_ADMIN...`);
    const passwordHash = bcrypt.hashSync(password, 12);
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        role: 'SUPER_ADMIN',
        name: name,
        isActive: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
    console.log(`SUPER_ADMIN "${name}" (${email}) updated successfully.`);
  } else {
    console.log(`Creating SUPER_ADMIN "${name}" (${email})...`);
    const passwordHash = bcrypt.hashSync(password, 12);
    await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase().trim(),
        role: 'SUPER_ADMIN',
        passwordHash,
        isActive: true,
      },
    });
    console.log(`SUPER_ADMIN "${name}" (${email}) created successfully.`);
  }

  await prisma.$disconnect();
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
