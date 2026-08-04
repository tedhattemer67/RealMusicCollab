// test-seed-2.js
// Run with: node test-seed-2.js
// Tests: Mix + MixComponent manifest + Song.currentMixId, and Todo with
// multiple assignees via the implicit many-to-many relation.

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // --- Two users, so we have someone to assign a Todo to besides the creator ---
  const admin = await prisma.user.create({
    data: { name: 'Ted', email: 'ted@example.com', instanceRole: 'ADMIN' },
  });
  const bandmate = await prisma.user.create({
    data: { name: 'Jamie', email: 'jamie@example.com', instanceRole: 'CONTRIBUTOR' },
  });

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
                  storageAdapter: 'LOCAL',
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

  // Promote that take to be the track's current default (mirrors what the
  // app would do automatically for an Admin upload).
  await prisma.track.update({
    where: { id: track.id },
    data: { currentTakeId: take.id },
  });

  // --- Build a Mix that references that specific take ---
  const mix = await prisma.mix.create({
    data: {
      songId: song.id,
      mixNumber: 1,
      storageAdapter: 'LOCAL',
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

  // Set it as the song's current mix
  await prisma.song.update({
    where: { id: song.id },
    data: { currentMixId: mix.id },
  });

  // --- A Todo assigned to both people ---
  const todo = await prisma.todo.create({
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

  // --- Read everything back together, to see it all hang correctly ---
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
