// set-sam-password.js
// One-off script: sets a new password directly on Sam's existing user row.
// Run with: node set-sam-password.js
// Safe to delete after running once — not part of the app itself.

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

const EMAIL = 'sam@example.com';
const NEW_PASSWORD = 'Gang0f4u#asgr8!!!'; // change this to whatever you want to actually use

async function main() {
  const passwordHash = await bcrypt.hash(NEW_PASSWORD, 10);

  const user = await prisma.user.update({
    where: { email: EMAIL },
    data: { passwordHash },
  });

  console.log(`Password reset for ${user.name} (${user.email}). Log in with:`);
  console.log(`  email: ${EMAIL}`);
  console.log(`  password: ${NEW_PASSWORD}`);
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
