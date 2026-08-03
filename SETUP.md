# Getting set up: GitHub + Render

Goal for right now: get `schema.prisma` running against a real, hosted Postgres
database so we can actually verify the model — not just read it. Deploying a
live web app comes later, once there's server code to deploy.

## 1. GitHub — create the repo

1. github.com → the "+" in the top right → **New repository**.
2. Name it whatever you like (e.g. `bandwork`, `sessionstack` — no need to
   decide the final name now).
3. Public or Private — private is fine for now; flip it to public whenever
   it's presentable enough to share.
4. Check the boxes for **Add a README**, **.gitignore** (choose the `Node`
   template), and **License: MIT** (matches the license decision from earlier).
5. Clone it to your machine: `git clone <the url>`.

## 2. Local project scaffold

Inside the cloned folder:

```bash
npm init -y
npm install prisma --save-dev
npm install @prisma/client
mkdir prisma
```

Drop the `schema.prisma` file we've been building into that new `prisma/`
folder (`prisma/schema.prisma`).

Create a `.env` file in the project root (the Node `.gitignore` template
already excludes `.env` — double check it's actually listed there, since this
file will hold real database credentials and should never be committed):

```
DATABASE_URL="postgresql://..."
```

You'll fill in the real value in step 4.

**If you're on Prisma 7 or later** (check with `npx prisma --version` —
this project was tested against 7.9.1), there's one more file needed.
Prisma 7 removed connection URLs from `schema.prisma` entirely; they now
live in a `prisma.config.ts` file at the project root instead:

```bash
npm install dotenv
```

```ts
// prisma.config.ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
```

This is why `schema.prisma`'s `datasource` block only has a `provider` line
now, with a comment pointing here instead of a `url` line.

Commit and push this scaffold:

```bash
git add .
git commit -m "Initial project scaffold with schema.prisma"
git push
```

## 3. Render — create the Postgres database

1. Sign up at render.com — using "Sign up with GitHub" also links your
   account for later, when we deploy an actual web service.
2. Dashboard → **New** → **PostgreSQL**.
3. Give it a name, pick a region close to you, leave the instance type on
   **Free** for now (see the expiration note below).
4. Once it's created, open the database's page and find the **Connect**
   section. You want the **External Database URL** — that's the one that
   works from your own machine, not just from other Render services.

**Free tier reality check:** a Free Render Postgres database is deleted after
30 days (14-day grace period to upgrade before that happens), capped at 1GB,
and has no backups. Perfectly fine for proving the schema works; don't let
real band data live there without upgrading to a paid instance first.

## 4. Connect Prisma to it and actually test the schema

1. Paste that External Database URL into your `.env` as `DATABASE_URL`.
2. Run the migration — this is the moment the schema becomes real tables:

```bash
npx prisma migrate dev --name init
```

3. Open Prisma's local GUI to actually look at what got created:

```bash
npx prisma studio
```

This is the real test: does `Track.currentTakeId` actually behave as a
nullable-then-set foreign key? Do the `Membership` / `SongRoleOverride`
tables look right? Can you manually insert a Project → Song → Track → Take
chain and see it hang together correctly?

## 5. Later: deploying an actual running app (not needed yet)

Once there's real server code (API routes, etc.) to go with the schema:

1. Render dashboard → **New** → **Web Service** → connect the same GitHub repo.
2. Set the build command (something like `npm install && npx prisma generate`)
   and the start command (whatever actually boots the server).
3. Set `DATABASE_URL` as an environment variable on the service — once both
   the app and the database live on Render, use the **Internal** Database URL
   instead of the External one (faster, and doesn't leave Render's network).

That step is a bridge to cross once there's an actual app to deploy — for now,
steps 1 through 4 are what "testing where we're at" means.

**One more Prisma 7 heads-up for later:** when you eventually write real
server code, `new PrismaClient()` alone won't connect to anything anymore —
v7 requires an explicit driver adapter (e.g. `@prisma/adapter-pg` for
Postgres). That's a step ahead of us right now (migrations and Prisma Studio
don't need it), but it'll come up the moment there's a server importing
`@prisma/client`.
