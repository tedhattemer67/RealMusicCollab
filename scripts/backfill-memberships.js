/*
 * One-off migration helper for the per-project access-control change.
 *
 * Before this change every logged-in user could see every project (access
 * fell back to their instanceRole). After it, a non-ADMIN user sees a project
 * only if they have a Membership row for it. Existing users therefore lose
 * access to everything on the first deploy unless you decide otherwise.
 *
 * Modes:
 *   report   (default) — print what a backfill WOULD create, write nothing.
 *   backfill            — give every non-ADMIN active user a Membership on
 *                         every existing project, at their current
 *                         instanceRole. Preserves today's behaviour exactly;
 *                         you then prune the rows you don't want by hand
 *                         (or from each project's Members panel).
 *
 * Instance ADMINs are skipped — they already have unconditional access and
 * don't need membership rows.
 *
 * Usage (from the repo root, with DATABASE_URL pointing at the target DB):
 *   node scripts/backfill-memberships.js            # report
 *   node scripts/backfill-memberships.js --backfill # write the rows
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const mode = process.argv.includes('--backfill') ? 'backfill' : 'report';

  const [projects, users] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({
      where: { active: true, instanceRole: { not: 'ADMIN' } },
      select: { id: true, name: true, instanceRole: true },
    }),
  ]);
  const existing = await prisma.membership.findMany({
    select: { userId: true, projectId: true },
  });
  const have = new Set(existing.map((m) => `${m.userId}:${m.projectId}`));

  const toCreate = [];
  for (const u of users) {
    for (const p of projects) {
      if (!have.has(`${u.id}:${p.id}`)) {
        toCreate.push({ userId: u.id, projectId: p.id, role: u.instanceRole });
      }
    }
  }

  console.log(`Projects: ${projects.length}`);
  console.log(`Non-admin active users: ${users.length}`);
  console.log(`Existing memberships: ${existing.length}`);
  console.log(`Memberships this backfill would create: ${toCreate.length}`);

  if (mode === 'report') {
    console.log('\nReport only — nothing written. Re-run with --backfill to apply.');
    return;
  }

  if (toCreate.length === 0) {
    console.log('\nNothing to create.');
    return;
  }

  const result = await prisma.membership.createMany({ data: toCreate, skipDuplicates: true });
  console.log(`\nCreated ${result.count} membership rows.`);
  console.log('Now prune the ones you do not want from each project’s Members panel.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
