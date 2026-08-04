// test-seed-2.js
// Run with: node test-seed-2.js
// Safe to run more than once: users are upserted by email rather than
// always freshly created. Tests: StorageConfig, Mix + MixComponent manifest
// + Song.currentMixId, and Todo with multiple assignees.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // --- Two users, upserted so re-running this script doesn't collide on email ---
  const admin = await prisma.user.upsert({
    where: { email: 'ted@example.com' },
    update: {},
    create: { name: 'Ted', email: 'ted@example.com', instanceRole: 'ADMIN' },
  });
  const bandmate = await prisma.user.upsert({
    where: { email: 'jamie@example.com' },
    update: {},
    create: { name: 'Jamie', email: 'jamie@example.com', instanceRole: 'CONTRIBUTOR' },
  });

  // --- A local StorageConfig for takes/mixes to reference ---
  let storageConfig = await prisma.storageConfig.findFirst({
    where: { type: 'LOCAL', isDefault: true },
  });
  if (!storageConfig) {
    storageConfig = await prisma.storageConfig.create({
      data: {
        type: 'LOCAL',
        label: 'Local test storage',
        isDefault: true,
        settings: { rootPath: './fake-storage' },
      },
    });
  }

  // --- Project -> Song -> Track -> Take, all in one nested write ---
  const project = await prisma.project.create({
    data: {
      name: 'Test EP',
      songs: {
        create: {
          title: 'Test Song',
          tracks: {
            create: {
              name: 'Lead vocal',
              takes: {
                create: {
                  takeNumber: 1,
                  storageConfigId: storageConfig.id,
                  storageKey: 'fake/path/vocal-take1.wav',
                  performedById: bandmate.id,
                  uploadedById: bandmate.id,
                },
              },
            },
          },
        },
      },
    },
    include: { songs: { include: { tracks: { include: { takes: true } } } } },
  });

  const song = project.songs[0];
  const track = song.tracks[0];
  const take = track.takes[0];

  // Promote that take to be the track's current default
  await prisma.track.update({
    where: { id: track.id },
    data: { currentTakeId: take.id },
  });

  // --- Build a Mix that references that specific take ---
  const mix = await prisma.mix.create({
    data: {
      songId: song.id,
      mixNumber: 1,
      storageConfigId: storageConfig.id,
      storageKey: 'fake/path/mix-v1.wav',
      uploadedById: admin.id,
      components: {
        create: {
          trackId: track.id,
          takeId: take.id,
        },
      },
    },
    include: { components: true },
  });

  await prisma.song.update({
    where: { id: song.id },
    data: { currentMixId: mix.id },
  });

  // --- A Todo assigned to both people ---
  await prisma.todo.create({
    data: {
      body: 'Fix the booming kick drum',
      trackId: track.id,
      createdById: admin.id,
      assignees: {
        connect: [{ id: admin.id }, { id: bandmate.id }],
      },
    },
    include: { assignees: true },
  });

  // --- Read everything back together ---
  const result = await prisma.song.findUnique({
    where: { id: song.id },
    include: {
      currentMix: { include: { components: true } },
      tracks: { include: { currentTake: true, todos: { include: { assignees: true } } } },
    },
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
