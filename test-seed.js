// test-seed.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const project = await prisma.project.create({
    data: {
      name: "Summer sessions EP",
      songs: {
        create: {
          title: "Midnight drive",
          tracks: {
            create: {
              name: "Lead vocal",
            },
          },
        },
      },
    },
    include: { songs: { include: { tracks: true } } },
  });
  console.log(JSON.stringify(project, null, 2));
}

main().finally(() => prisma.$disconnect());