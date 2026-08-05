// set-ted-password.js
// One-off script: sets a password directly on Ted's existing user row,
// since that account was created by the seed script (never through invite
// redemption) and has no passwordHash yet.
// Run with: node set-ted-password.js
// Safe to delete after running once — not part of the app itself.

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const EMAIL = 'ted@example.com';
const NEW_PASSWORD = 'changeme123'; // change this to whatever you want to actually use

async function main() {
  const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);

  const user = await prisma.user.update({
    where: { email: EMAIL },
    data: { passwordHash },
  });

  console.log(`Password set for ${user.name} (${user.email}). You can now log in with:`);
  console.log(`  email: ${EMAIL}`);
  console.log(`  password: ${NEW_PASSWORD}`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
