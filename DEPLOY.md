# Deploying to Render

You already have the pieces this depends on: everything's on GitHub, the
Postgres database is already running on Render, and you have real S3
credentials from today's setup. This walks through making the actual app
(backend + frontend) live.

## Step 1: Deploy the backend as a Web Service

1. Render dashboard → **New** → **Web Service** → connect your GitHub repo.
2. **Root Directory**: leave blank (repo root) — this matters, since npm
   workspaces needs to install from the root to resolve the whole monorepo
   correctly, not just one package.
3. **Build Command**:
   ```
   npm install && npx prisma generate && npx prisma migrate deploy
   ```
   (`migrate deploy` is the production-safe version of the migration command
   we've been running locally — it applies any pending migrations
   automatically on every deploy, rather than you needing to remember to run
   it by hand against the live database.)
4. **Start Command**:
   ```
   npm run start:server
   ```
5. **Environment variables** (Render dashboard → your service → Environment):
   - `DATABASE_URL` — your existing Render Postgres connection string
   - `NODE_ENV` = `production`
   - `CLIENT_ORIGIN` — you'll fill this in during Step 3, once the frontend
     has a real URL
   - `STORAGE_ADAPTER` = `S3`
   - `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` —
     the exact same values from your local `.env`
6. Deploy. Once it's live, copy the URL Render gives it (something like
   `https://your-app.onrender.com`) — you'll need it in Step 2.

## Step 2: Deploy the frontend as a Static Site

1. Render dashboard → **New** → **Static Site** → the same GitHub repo.
2. **Root Directory**: blank again, same reasoning as Step 1.
3. **Build Command**:
   ```
   npm install && npm run build --workspace packages/client
   ```
4. **Publish Directory**:
   ```
   packages/client/dist
   ```
5. **Environment variable**: `VITE_API_BASE_URL` = the backend's URL from
   Step 1, with `/api` on the end (e.g.
   `https://your-app.onrender.com/api`). This has to be set **before** the
   build runs — Vite bakes it into the built files at build time, it isn't
   read at runtime like a normal server env var.
6. Deploy. Copy this URL too (something like
   `https://your-frontend.onrender.com`).

## Step 3: Wire the two together

Go back to the **backend** service's environment variables and set:
```
CLIENT_ORIGIN=https://your-frontend.onrender.com
```
(the exact frontend URL from Step 2, no trailing slash). Saving this
triggers a quick redeploy of the backend, picking up the real value instead
of the localhost default.

## Step 4: Test the real thing

Visit the frontend's live URL, log in, and try uploading a take. If
everything's wired correctly, it should land in the real S3 bucket — the
same thing we just proved works locally, now happening on the actual
deployed app.

## Worth knowing

- **Free-tier Render web services "spin down" after inactivity** and take a
  few seconds to wake back up on the first request after being idle — normal
  behavior, not a bug if the first login of the day feels slow.
- **Every `git push` to `main` triggers Render to automatically rebuild and
  redeploy both services** — no manual redeploy step needed going forward.
- Since `STORAGE_ADAPTER` is set at the Render service level, not baked into
  a commit, your **local machine can keep using `LOCAL` storage for
  everyday testing** without touching production data in S3, and vice versa.
